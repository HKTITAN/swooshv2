# Standalone Touch Injection Sanity Test
#
# Run this in PowerShell from anywhere — it does NOT depend on Swoosh.
# It calls InitializeTouchInjection + InjectTouchInput using the
# exact same code path Swoosh's PowerShell helper uses, with the
# field values that match Microsoft's official TouchInjection sample.
#
# Expected output on a working install:
#   Init: True
#   Inject DOWN: True, error: 0
#   Inject UP:   True, error: 0
#
# If you see `Inject DOWN: False, error: 87` (or similar), Windows
# is rejecting synthetic touch input on this machine independent of
# Swoosh. That's an OS / driver / policy issue, not something we can
# fix in our code. Workaround: use the mouse, keep the hand cursor as
# visual feedback.
#
# Usage:
#   pwsh -ExecutionPolicy Bypass -File scripts/test-touch-injection.ps1
#   (or `powershell` on older Windows)

$ErrorActionPreference = 'Stop'

Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct POINT { public int x; public int y; }

[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int left; public int top; public int right; public int bottom; }

[StructLayout(LayoutKind.Sequential)]
public struct PI {
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
public struct PTI {
    public PI pointerInfo;
    public uint touchFlags;
    public uint touchMask;
    public RECT rcContact;
    public RECT rcContactRaw;
    public uint orientation;
    public uint pressure;
}

public static class TI {
    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool InitializeTouchInjection(uint maxCount, uint dwMode);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool InjectTouchInput(uint count, [In] PTI[] contacts);
}
"@

$initOk = [TI]::InitializeTouchInjection(10, 1)  # 1 = TOUCH_FEEDBACK_DEFAULT
$initErr = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
Write-Host "Init: $initOk (error: $initErr)"

if (-not $initOk) {
    Write-Host "InitializeTouchInjection failed — touch injection is not available on this machine."
    exit 1
}

$contacts = New-Object 'PTI[]' 1
$c = New-Object PTI
$c.pointerInfo.pointerType = 2          # PT_TOUCH
$c.pointerInfo.pointerId   = 0
$c.pointerInfo.pointerFlags = 0x10006   # DOWN | INRANGE | INCONTACT
$c.pointerInfo.ptPixelLocation     = New-Object POINT
$c.pointerInfo.ptPixelLocation.x   = 500
$c.pointerInfo.ptPixelLocation.y   = 500
# Everything else stays at struct default (zero) — matches the MS sample.
$c.touchFlags = 0
$c.touchMask  = 0x07                    # CONTACTAREA | ORIENTATION | PRESSURE
$c.rcContact   = New-Object RECT
$c.rcContact.left   = 498
$c.rcContact.top    = 498
$c.rcContact.right  = 502
$c.rcContact.bottom = 502
$c.orientation = 90
$c.pressure    = 32000
$contacts[0]   = $c

$downOk  = [TI]::InjectTouchInput(1, $contacts)
$downErr = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
Write-Host "Inject DOWN: $downOk (error: $downErr)"

Start-Sleep -Milliseconds 50

$c.pointerInfo.pointerFlags = 0x40000   # UP
$contacts[0] = $c
$upOk  = [TI]::InjectTouchInput(1, $contacts)
$upErr = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
Write-Host "Inject UP:   $upOk (error: $upErr)"

Write-Host ""
if ($downOk -and $upOk) {
    Write-Host "TOUCH INJECTION WORKS on this machine."
} else {
    Write-Host "TOUCH INJECTION FAILS on this machine (error code: $downErr)."
    Write-Host ""
    Write-Host "Common causes for error 87 (ERROR_INVALID_PARAMETER):"
    Write-Host "  - Windows policy or AV blocking synthetic input"
    Write-Host "  - Display driver intercept that doesn't expose the touch interface"
    Write-Host "  - The host has touch injection disabled at the kernel/registry level"
    Write-Host "  - Running inside a VM whose virtual GPU doesn't advertise touch capability"
}
