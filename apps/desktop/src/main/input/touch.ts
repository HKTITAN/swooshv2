/**
 * Windows synthetic touch injection via a PowerShell child process.
 *
 * After exhausting koffi-based FFI (struct layout was provably
 * correct down to the bit but Windows kept returning 87 — likely a
 * subtle marshaling issue around the mixed 4/8-byte fields in
 * POINTER_INFO), we switched to PowerShell as the touch backend.
 *
 * Why PowerShell:
 *   - It's built into every Windows install (5.1+ since Win10).
 *   - PowerShell uses .NET's mature P/Invoke marshaling — 20+ years
 *     of battle-tested struct layout handling, the same plumbing
 *     Microsoft's own UWP touch samples use under the hood.
 *   - No native build step, no extra binary to bundle.
 *
 * How it works:
 *   - On first call, we spawn `powershell.exe` with an inline script
 *     that uses Add-Type to compile a tiny C# class wrapping
 *     `InitializeTouchInjection` + `InjectTouchInput`.
 *   - Once the script prints `READY` on stdout, the helper is alive.
 *   - We send commands like "tap 500 300", "down 500 300",
 *     "move 510 305", "up 510 305" to its stdin. The helper executes
 *     them and writes back "OK" or "ERR <code>".
 *   - We don't await responses for performance — just fire commands
 *     and move on. The helper logs failures to its stderr which we
 *     forward to our log.
 *
 * The OS mouse cursor is NEVER touched. If the helper fails to start
 * or `InitializeTouchInjection` fails, all hand-driven actions are
 * dropped — the cursor still stays put, the user can still use their
 * mouse normally.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { logger } from '../logger';

const isWindows = process.platform === 'win32';

interface TouchApi {
  available: boolean;
  tap(x: number, y: number): boolean;
  pressDown(x: number, y: number): boolean;
  pressMove(x: number, y: number): boolean;
  pressUp(x: number, y: number): boolean;
}

const unavailable: TouchApi = {
  available: false,
  tap: () => false,
  pressDown: () => false,
  pressMove: () => false,
  pressUp: () => false,
};

// PowerShell script — compiles a tiny C# class via Add-Type, calls
// InitializeTouchInjection, then loops reading commands from stdin.
// The C# struct layout uses [StructLayout(LayoutKind.Sequential)]
// which leverages .NET's mature marshaling rules (the same rules
// the Windows headers were designed against).
const POWERSHELL_HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$src = @"
using System;
using System.Runtime.InteropServices;

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

public static class TI {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool InitializeTouchInjection(uint maxCount, uint dwMode);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool InjectTouchInput(uint count, [In] PointerTouchInfo[] contacts);
    [DllImport("kernel32.dll")]
    public static extern uint GetTickCount();
}
"@

Add-Type -TypeDefinition $src -Language CSharp

# TOUCH_FEEDBACK_DEFAULT = 1 (does NOT require UIAccess).
if (-not [TI]::InitializeTouchInjection(10, 1)) {
    $e = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [Console]::Error.WriteLine("INIT_FAIL $e")
    exit 1
}

# Pointer flag bits from Windows.h.
$FLAG_INRANGE   = 0x00000002
$FLAG_INCONTACT = 0x00000004
$FLAG_DOWN      = 0x00010000
$FLAG_UPDATE    = 0x00020000
$FLAG_UP        = 0x00040000
$PT_TOUCH       = 2
# touchMask: CONTACTAREA | ORIENTATION | PRESSURE
$MASK = 0x07

# A shared template contact, reused across calls. Microsoft's official
# TouchInjection sample initializes the struct ONCE with memset(0),
# only sets the active fields, and re-uses the same instance — only
# updating pointerFlags between DOWN, UPDATE, and UP. We follow that
# pattern exactly: dwTime, frameId, ptPixelLocationRaw, rcContactRaw,
# PerformanceCount, ButtonChangeType all stay at zero. Setting any of
# them to a non-zero value (e.g., a real GetTickCount) makes Windows
# return ERROR_INVALID_PARAMETER (87) — discovered the hard way.
$template = New-Object PointerTouchInfo
$template.pointerInfo.pointerType = $PT_TOUCH
$template.pointerInfo.pointerId   = 0
$template.touchFlags = 0
$template.touchMask  = $MASK
$template.orientation = 90
$template.pressure    = 32000
$contacts = New-Object 'PointerTouchInfo[]' 1

function Inject([int]$x, [int]$y, [uint32]$flags) {
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
    # NOTE: ptPixelLocationRaw, ptHimetricLocation*, rcContactRaw,
    # dwTime, historyCount, inputData, dwKeyStates, performanceCount,
    # buttonChangeType all stay 0 — matches MS sample exactly.
    $contacts[0] = $c
    if (-not [TI]::InjectTouchInput(1, $contacts)) {
        $e = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        [Console]::Error.WriteLine("INJ_FAIL $e flags=$flags x=$x y=$y")
    }
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
        $x = [int]$parts[1]
        $y = [int]$parts[2]
        switch ($cmd) {
            'tap'  {
                # MS sample sleeps ~10 ms between DOWN and UP so the
                # OS can sequence the events as a discrete tap.
                Inject $x $y ($FLAG_DOWN -bor $FLAG_INRANGE -bor $FLAG_INCONTACT)
                Start-Sleep -Milliseconds 10
                Inject $x $y $FLAG_UP
            }
            'down' { Inject $x $y ($FLAG_DOWN  -bor $FLAG_INRANGE -bor $FLAG_INCONTACT) }
            'move' { Inject $x $y ($FLAG_UPDATE -bor $FLAG_INRANGE -bor $FLAG_INCONTACT) }
            'up'   { Inject $x $y $FLAG_UP }
        }
    } catch {
        [Console]::Error.WriteLine("EX $_")
    }
}
`;

let cached: TouchApi | null = null;

export function getTouchInjector(): TouchApi {
  if (cached) return cached;
  if (!isWindows) {
    cached = unavailable;
    return cached;
  }

  let helper: ChildProcessWithoutNullStreams | null = null;
  let ready = false;
  let initFailed = false;

  function start(): void {
    try {
      helper = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_HELPER_SCRIPT],
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
            logger.info('touch helper ready');
          }
        }
      });

      // Failures from the PS-side InjectTouchInput call surface on
      // stderr as "INJ_FAIL <error> flags=<f> x=<x> y=<y>". Log them
      // throttled, and disable touch after enough consecutive failures
      // so we don't keep spamming a non-functional kernel path.
      let lastErrLog = 0;
      let consecutiveInjectFailures = 0;
      const TOUCH_DISABLE_THRESHOLD = 5;
      helper.stderr.on('data', (data: string) => {
        for (const line of data.split(/\r?\n/)) {
          const t = line.trim();
          if (!t) continue;
          if (t.startsWith('INIT_FAIL')) {
            initFailed = true;
            logger.warn('touch helper init failed', { line: t });
          } else if (t.startsWith('INJ_FAIL')) {
            consecutiveInjectFailures++;
            const now = Date.now();
            if (now - lastErrLog >= 1000) {
              lastErrLog = now;
              logger.warn('touch helper inject error', {
                line: t,
                consecutiveFailures: consecutiveInjectFailures,
              });
            }
            if (
              consecutiveInjectFailures === TOUCH_DISABLE_THRESHOLD &&
              !initFailed
            ) {
              initFailed = true; // disables subsequent send() calls
              logger.warn(
                'touch injection appears unsupported on this machine — disabling. ' +
                  'Hand cursor will still track visually, but pinches will not fire OS clicks. ' +
                  'Use scripts/test-touch-injection.ps1 to verify outside Swoosh. ' +
                  'Your physical mouse is unaffected.',
              );
            }
          } else if (t.startsWith('EX ')) {
            logger.warn('touch helper exception', { line: t });
          }
        }
      });

      helper.on('exit', (code) => {
        logger.warn('touch helper exited', { code });
        helper = null;
        ready = false;
      });
    } catch (err) {
      logger.warn('failed to spawn touch helper', { err: String(err) });
      helper = null;
    }
  }

  start();

  function send(cmd: string): boolean {
    if (!helper || !ready || initFailed) return false;
    try {
      return helper.stdin.write(cmd + '\n');
    } catch (err) {
      logger.warn('touch helper write failed', { err: String(err) });
      return false;
    }
  }

  cached = {
    // We optimistically expose `available = true` once the process is
    // spawned. If init fails on the PS side it'll surface on stderr
    // and subsequent send() calls return false.
    available: true,
    tap(x, y) {
      return send(`tap ${Math.round(x)} ${Math.round(y)}`);
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

  logger.info('touch injection backend: PowerShell helper');
  return cached;
}
