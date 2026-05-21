/**
 * Hand-input OS integration — UI Automation primary, touch fallback.
 *
 * After three rounds of touch injection failing at the OS level on
 * the host machine (ERROR_INVALID_PARAMETER even with byte-perfect
 * packets matching Microsoft's official sample, verified via both
 * koffi FFI and .NET P/Invoke), we switched the primary click path
 * to UI Automation.
 *
 * UI Automation is Windows' accessibility framework. Every visible
 * UI element exposes itself via IUIAutomationElement; we can find
 * the element at a screen point and call its native Invoke() pattern
 * (or LegacyIAccessible default action) to activate it. The OS
 * cursor never moves and the user's mouse remains untouched.
 *
 * Coverage:
 *   + Chrome, Edge, Firefox (full UIA tree)
 *   + Microsoft Office
 *   + Electron apps (Slack, VS Code, Discord, etc.)
 *   + Most native .NET apps
 *   + Win32 apps that expose MSAA / UIA properly
 *   - Games, custom-render apps, anything that doesn't expose UIA
 *
 * Mechanism:
 *   - We spawn powershell.exe once with an inline C# helper.
 *   - The helper uses System.Windows.Automation (UI Automation
 *     client SDK shipped with .NET) and System.Windows.Input.
 *   - Node sends commands: 'click x y', 'scrollUp x y', 'scrollDown x y',
 *     'down x y', 'move x y', 'up x y' (touch — kept for the systems
 *     where it works), 'quit'.
 *   - Helper prints OK / NOELT / FAIL per command on stderr.
 *
 * Architectural rule (unchanged): hand input never moves the OS
 * mouse cursor. If a hand action can't be executed (UIA elt not
 * invokable, touch unsupported), the action is silently dropped.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { logger } from '../logger';

const isWindows = process.platform === 'win32';

interface InputApi {
  available: boolean;
  /**
   * Activate the UI element at (x, y) via UI Automation.
   * Falls back to a touch tap if UIA doesn't find an invokable element.
   */
  click(x: number, y: number): boolean;
  /** Scroll the scrollable element at (x, y) up by one increment. */
  scrollUp(x: number, y: number): boolean;
  /** Scroll down by one increment. */
  scrollDown(x: number, y: number): boolean;
  /** Touch-based drag, used when touch injection works on the host. */
  pressDown(x: number, y: number): boolean;
  pressMove(x: number, y: number): boolean;
  pressUp(x: number, y: number): boolean;
}

const unavailable: InputApi = {
  available: false,
  click: () => false,
  scrollUp: () => false,
  scrollDown: () => false,
  pressDown: () => false,
  pressMove: () => false,
  pressUp: () => false,
};

const POWERSHELL_HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase

$src = @"
using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;

[StructLayout(LayoutKind.Sequential)]
public struct POINT { public int x; public int y; }

[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int left; public int top; public int right; public int bottom; }

[StructLayout(LayoutKind.Sequential)]
public struct PointerInfo {
    public uint pointerType;
    public uint pointerId;
    public uint frameId;
    public uint pointerFlags;
    public IntPtr sourceDevice;
    public IntPtr hwndTarget;
    public POINT ptPixelLocation;
    public POINT ptPixelLocationRaw;
    public POINT ptHimetricLocation;
    public POINT ptHimetricLocationRaw;
    public uint dwTime;
    public uint historyCount;
    public int inputData;
    public uint dwKeyStates;
    public ulong performanceCount;
    public int buttonChangeType;
}

[StructLayout(LayoutKind.Sequential)]
public struct PointerTouchInfo {
    public PointerInfo pointerInfo;
    public uint touchFlags;
    public uint touchMask;
    public RECT rcContact;
    public RECT rcContactRaw;
    public uint orientation;
    public uint pressure;
}

public static class WIN {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool InitializeTouchInjection(uint maxCount, uint dwMode);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool InjectTouchInput(uint count, [In] PointerTouchInfo[] contacts);
}

public static class UIA {
    /**
     * Find the most specific UIA element at the given screen point
     * and try to activate it. Returns:
     *   "OK"      — invoked / toggled successfully
     *   "NOELT"   — no element at that point
     *   "NOPATTERN" — element found but has no invokable pattern
     */
    public static string Click(int x, int y) {
        try {
            var pt = new System.Windows.Point(x, y);
            var elt = AutomationElement.FromPoint(pt);
            if (elt == null) return "NOELT";

            // 1. InvokePattern — preferred (buttons, links, menu items).
            object invokeObj;
            if (elt.TryGetCurrentPattern(InvokePattern.Pattern, out invokeObj)) {
                ((InvokePattern)invokeObj).Invoke();
                return "OK";
            }
            // 2. TogglePattern — checkboxes, toggle buttons.
            object toggleObj;
            if (elt.TryGetCurrentPattern(TogglePattern.Pattern, out toggleObj)) {
                ((TogglePattern)toggleObj).Toggle();
                return "OK";
            }
            // 3. SelectionItemPattern — list/tree items, tabs, radios.
            object selObj;
            if (elt.TryGetCurrentPattern(SelectionItemPattern.Pattern, out selObj)) {
                ((SelectionItemPattern)selObj).Select();
                return "OK";
            }
            // 4. ExpandCollapsePattern — combo boxes, tree nodes.
            object expandObj;
            if (elt.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out expandObj)) {
                var p = (ExpandCollapsePattern)expandObj;
                if (p.Current.ExpandCollapseState == ExpandCollapseState.Collapsed)
                    p.Expand();
                else
                    p.Collapse();
                return "OK";
            }
            return "NOPATTERN";
        } catch (Exception ex) {
            return "EX:" + ex.Message;
        }
    }

    /** Scroll up one increment on the scrollable element at (x, y). */
    public static string ScrollUp(int x, int y) {
        return ScrollImpl(x, y, ScrollAmount.SmallDecrement, true);
    }
    public static string ScrollDown(int x, int y) {
        return ScrollImpl(x, y, ScrollAmount.SmallIncrement, true);
    }
    static string ScrollImpl(int x, int y, ScrollAmount amount, bool vertical) {
        try {
            var pt = new System.Windows.Point(x, y);
            var elt = AutomationElement.FromPoint(pt);
            if (elt == null) return "NOELT";

            // Walk up the tree until we find something scrollable. The
            // hit element is usually a leaf (text), the scroll container
            // is one or more parents up.
            var walker = TreeWalker.RawViewWalker;
            var cur = elt;
            while (cur != null) {
                object scrollObj;
                if (cur.TryGetCurrentPattern(ScrollPattern.Pattern, out scrollObj)) {
                    var sp = (ScrollPattern)scrollObj;
                    if (vertical && sp.Current.VerticallyScrollable) {
                        sp.Scroll(ScrollAmount.NoAmount, amount);
                        return "OK";
                    }
                }
                object siObj;
                if (cur.TryGetCurrentPattern(ScrollItemPattern.Pattern, out siObj)) {
                    ((ScrollItemPattern)siObj).ScrollIntoView();
                    return "OK";
                }
                cur = walker.GetParent(cur);
            }
            return "NOSCROLL";
        } catch (Exception ex) {
            return "EX:" + ex.Message;
        }
    }
}
"@

Add-Type -TypeDefinition $src -ReferencedAssemblies UIAutomationClient,UIAutomationTypes,WindowsBase -Language CSharp

# Touch injection — attempted but may fail on hosts where the kernel
# rejects synthetic touch (the user's case). We try it; if it never
# works the gestureRouter has its own threshold to stop sending touch
# commands. UIA is now the primary click path.
$touchAvailable = [WIN]::InitializeTouchInjection(10, 1)
if (-not $touchAvailable) {
    [Console]::Error.WriteLine("TOUCH_INIT_FAIL " + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error())
}

$contacts = New-Object 'PointerTouchInfo[]' 1
$template = New-Object PointerTouchInfo
$template.pointerInfo.pointerType = 2  # PT_TOUCH
$template.pointerInfo.pointerId   = 0
$template.touchFlags = 0
$template.touchMask  = 0x07
$template.orientation = 90
$template.pressure    = 32000

$FLAG_INRANGE   = 0x00000002
$FLAG_INCONTACT = 0x00000004
$FLAG_DOWN      = 0x00010000
$FLAG_UPDATE    = 0x00020000
$FLAG_UP        = 0x00040000

function InjectTouch([int]$x, [int]$y, [uint32]$flags) {
    if (-not $touchAvailable) { return $false }
    $c = $template
    $c.pointerInfo.ptPixelLocation = New-Object POINT
    $c.pointerInfo.ptPixelLocation.x = $x
    $c.pointerInfo.ptPixelLocation.y = $y
    $c.pointerInfo.pointerFlags = $flags
    $c.rcContact = New-Object RECT
    $c.rcContact.left   = $x - 2
    $c.rcContact.top    = $y - 2
    $c.rcContact.right  = $x + 2
    $c.rcContact.bottom = $y + 2
    $contacts[0] = $c
    if (-not [WIN]::InjectTouchInput(1, $contacts)) {
        $e = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        [Console]::Error.WriteLine("INJ_FAIL $e flags=$flags x=$x y=$y")
        return $false
    }
    return $true
}

[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Length -eq 0) { continue }
    try {
        $parts = $line.Split(' ')
        $cmd = $parts[0]
        if ($cmd -eq 'quit') { break }

        switch ($cmd) {
            'click' {
                $x = [int]$parts[1]; $y = [int]$parts[2]
                $r = [UIA]::Click($x, $y)
                if ($r -ne 'OK') {
                    [Console]::Error.WriteLine("UIA_CLICK $r x=$x y=$y")
                }
            }
            'scrollUp' {
                $x = [int]$parts[1]; $y = [int]$parts[2]
                $r = [UIA]::ScrollUp($x, $y)
                if ($r -ne 'OK') {
                    [Console]::Error.WriteLine("UIA_SCROLL $r x=$x y=$y")
                }
            }
            'scrollDown' {
                $x = [int]$parts[1]; $y = [int]$parts[2]
                $r = [UIA]::ScrollDown($x, $y)
                if ($r -ne 'OK') {
                    [Console]::Error.WriteLine("UIA_SCROLL $r x=$x y=$y")
                }
            }
            'down' { InjectTouch ([int]$parts[1]) ([int]$parts[2]) ($FLAG_DOWN -bor $FLAG_INRANGE -bor $FLAG_INCONTACT) | Out-Null }
            'move' { InjectTouch ([int]$parts[1]) ([int]$parts[2]) ($FLAG_UPDATE -bor $FLAG_INRANGE -bor $FLAG_INCONTACT) | Out-Null }
            'up'   { InjectTouch ([int]$parts[1]) ([int]$parts[2]) $FLAG_UP | Out-Null }
        }
    } catch {
        [Console]::Error.WriteLine("EX $_")
    }
}
`;

let cached: InputApi | null = null;

export function getTouchInjector(): InputApi {
  if (cached) return cached;
  if (!isWindows) {
    cached = unavailable;
    return cached;
  }

  let helper: ChildProcessWithoutNullStreams | null = null;
  let ready = false;

  function start(): void {
    try {
      helper = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          POWERSHELL_HELPER_SCRIPT,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );

      helper.stdout.setEncoding('utf8');
      helper.stderr.setEncoding('utf8');

      helper.stdout.on('data', (data: string) => {
        for (const line of data.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'READY') {
            ready = true;
            logger.info('input helper ready (UIA primary + touch attempt)');
          }
        }
      });

      let lastErrLog = 0;
      let touchInjectFails = 0;
      let touchDisabled = false;
      helper.stderr.on('data', (data: string) => {
        for (const line of data.split(/\r?\n/)) {
          const t = line.trim();
          if (!t) continue;
          if (t.startsWith('TOUCH_INIT_FAIL')) {
            logger.warn('touch injection init failed (UIA still works)', { line: t });
          } else if (t.startsWith('INJ_FAIL')) {
            touchInjectFails++;
            if (touchInjectFails === 5 && !touchDisabled) {
              touchDisabled = true;
              logger.warn(
                'touch injection unsupported on this host — pinch-drag disabled. ' +
                  'UIA-based click and scroll still work. Mouse unaffected.',
              );
            }
            const now = Date.now();
            if (now - lastErrLog >= 1000) {
              lastErrLog = now;
              logger.warn('touch helper inject error', {
                line: t,
                fails: touchInjectFails,
              });
            }
          } else if (t.startsWith('UIA_CLICK')) {
            // Common case: NOELT (clicked on desktop / non-UIA region)
            // or NOPATTERN (decorative element). Log throttled.
            const now = Date.now();
            if (now - lastErrLog >= 1000) {
              lastErrLog = now;
              logger.info('UIA click could not activate element', { line: t });
            }
          } else if (t.startsWith('UIA_SCROLL') || t.startsWith('EX ')) {
            const now = Date.now();
            if (now - lastErrLog >= 1000) {
              lastErrLog = now;
              logger.info('input helper note', { line: t });
            }
          }
        }
      });

      helper.on('exit', (code) => {
        logger.warn('input helper exited', { code });
        helper = null;
        ready = false;
      });
    } catch (err) {
      logger.warn('failed to spawn input helper', { err: String(err) });
      helper = null;
    }
  }

  start();

  function send(cmd: string): boolean {
    if (!helper || !ready) return false;
    try {
      return helper.stdin.write(cmd + '\n');
    } catch (err) {
      logger.warn('input helper write failed', { err: String(err) });
      return false;
    }
  }

  cached = {
    available: true,
    click(x, y) {
      return send(`click ${Math.round(x)} ${Math.round(y)}`);
    },
    scrollUp(x, y) {
      return send(`scrollUp ${Math.round(x)} ${Math.round(y)}`);
    },
    scrollDown(x, y) {
      return send(`scrollDown ${Math.round(x)} ${Math.round(y)}`);
    },
    pressDown(x, y) {
      return send(`down ${Math.round(x)} ${Math.round(y)}`);
    },
    pressMove(x, y) {
      return send(`move ${Math.round(x)} ${Math.round(y)}`);
    },
    pressUp(x, y) {
      return send(`up ${Math.round(x)} ${Math.round(y)}`);
    },
  };

  logger.info('input backend: UI Automation + touch via PowerShell helper');
  return cached;
}
