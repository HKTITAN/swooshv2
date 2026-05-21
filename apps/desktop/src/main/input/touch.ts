/**
 * Windows synthetic touch injection — true multi-input.
 *
 * Calls user32.dll's `InitializeTouchInjection` + `InjectTouchInput`
 * directly via koffi so Swoosh can fire taps / drags / pans at
 * arbitrary screen coordinates WITHOUT moving the OS mouse cursor.
 * The OS treats touch and mouse as separate input devices; modern
 * apps (browsers, Office, Electron, UWP) handle touch natively, and
 * older apps get automatic touch → mouse promotion from Windows
 * without the cursor being yanked from the user's physical mouse.
 *
 * Implementation note: we pack POINTER_TOUCH_INFO into a raw Buffer
 * by hand rather than relying on koffi's struct marshaling. The Win32
 * struct has mixed 4 / 8-byte fields (pointers, UINT64 PerformanceCount,
 * trailing 4-byte enum) and any subtle padding mismatch causes
 * InjectTouchInput to return ERROR_INVALID_PARAMETER (87) with no
 * indication of which field was wrong. Manual byte layout matches the
 * Windows headers exactly, removing that whole class of bug.
 *
 * Privilege note: `InjectTouchInput` will not deliver events to
 * higher-integrity-level windows (e.g., elevated Task Manager) unless
 * the calling process has UIAccess. Same-integrity apps (everything
 * a normal user clicks on) work fine without elevation.
 *
 * On non-Windows platforms `touch.available` is false; callers fall
 * back to the mouse-with-restore path. macOS / Linux equivalents
 * (`CGEvent` + trackpad source, uinput) are tracked separately.
 */

import { logger } from '../logger';

const isWindows = process.platform === 'win32';

// Pointer flag bits — see Windows.h. Matches Microsoft's official
// TouchInjection sample at:
// https://github.com/microsoft/Windows-classic-samples/.../Touchinjection.cpp
const POINTER_FLAG_INRANGE = 0x00000002;
const POINTER_FLAG_INCONTACT = 0x00000004;
const POINTER_FLAG_DOWN = 0x00010000;
const POINTER_FLAG_UPDATE = 0x00020000;
const POINTER_FLAG_UP = 0x00040000;

// PT_TOUCH discriminator for the POINTER_INFO union.
const PT_TOUCH = 0x00000002;

// Touch feedback mode: NONE suppresses Windows' default ripple ring
// that appears around synthetic touch points — we have our own
// SwooshCursor for visual feedback.
const TOUCH_FEEDBACK_NONE = 0x3;

// touchMask declares which auxiliary fields are valid. Must match
// exactly which fields the packet populates, or Windows returns
// ERROR_INVALID_PARAMETER.
const TOUCH_MASK_CONTACTAREA = 0x00000001;
const TOUCH_MASK_ORIENTATION = 0x00000002;
const TOUCH_MASK_PRESSURE = 0x00000004;
const TOUCH_FLAG_NONE = 0x0;

const MAX_CONTACTS = 10;

// POINTER_TOUCH_INFO byte layout on x64. Field offsets are absolute
// from the start of the struct; total size is 144 bytes.
//
//   Offset  Size  Field
//   ------  ----  ------------------------------------------
//        0    4   pointerInfo.pointerType (POINTER_INPUT_TYPE enum = int32)
//        4    4   pointerInfo.pointerId
//        8    4   pointerInfo.frameId
//       12    4   pointerInfo.pointerFlags
//       16    8   pointerInfo.sourceDevice (HANDLE on x64)
//       24    8   pointerInfo.hwndTarget   (HWND on x64)
//       32    8   pointerInfo.ptPixelLocation       (POINT = 2 × int32)
//       40    8   pointerInfo.ptPixelLocationRaw    (POINT)
//       48    8   pointerInfo.ptHimetricLocation    (POINT)
//       56    8   pointerInfo.ptHimetricLocationRaw (POINT)
//       64    4   pointerInfo.dwTime
//       68    4   pointerInfo.historyCount
//       72    4   pointerInfo.inputData
//       76    4   pointerInfo.dwKeyStates
//       80    8   pointerInfo.performanceCount (UINT64, needs 8-byte aligned — 80 is ✓)
//       88    4   pointerInfo.buttonChangeType (enum = int32)
//       92    4   (trailing padding so POINTER_INFO is 96 bytes total)
//       96    4   touchFlags
//      100    4   touchMask
//      104   16   rcContact (RECT = 4 × int32)
//      120   16   rcContactRaw
//      136    4   orientation
//      140    4   pressure
//      ====  144 bytes
const POINTER_TOUCH_INFO_SIZE = 144;

interface TouchApi {
  available: boolean;
  /**
   * Fire a one-shot tap at the given screen pixel position. Returns
   * false if injection failed and the caller should fall back to
   * mouse input.
   */
  tap(x: number, y: number): boolean;
  /** Begin a sustained touch contact (drag / pan). */
  pressDown(x: number, y: number): boolean;
  /** Update the contact's position (continues a drag). */
  pressMove(x: number, y: number): boolean;
  /** End the contact. */
  pressUp(x: number, y: number): boolean;
}

const unavailable: TouchApi = {
  available: false,
  tap: () => false,
  pressDown: () => false,
  pressMove: () => false,
  pressUp: () => false,
};

// Monotonically increasing frame id + tick clock for every packet we
// send. Windows rejects packets with dwTime == 0 AND PerformanceCount
// == 0; it also expects successive frames to have strictly increasing
// time. Sharing one counter across the whole module guarantees both.
let nextFrameId = 1;
const tickEpoch = Date.now();
function nextTick(): number {
  // Truncate to 32 bits; this needs to be roughly system-tick-like
  // (milliseconds since some recent epoch). The value is opaque to
  // Windows as long as it monotonically advances.
  return (Date.now() - tickEpoch) >>> 0;
}

function packTouchInfo(x: number, y: number, flags: number, pointerId = 0): Buffer {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const buf = Buffer.alloc(POINTER_TOUCH_INFO_SIZE);

  // POINTER_INFO (96 bytes including 4-byte trailing pad to 8-align)
  buf.writeUInt32LE(PT_TOUCH, 0);
  buf.writeUInt32LE(pointerId, 4);
  buf.writeUInt32LE(nextFrameId++, 8); // frameId — must vary across frames
  buf.writeUInt32LE(flags >>> 0, 12);
  buf.writeBigUInt64LE(0n, 16); // sourceDevice = NULL
  buf.writeBigUInt64LE(0n, 24); // hwndTarget   = NULL
  buf.writeInt32LE(ix, 32); // ptPixelLocation.x
  buf.writeInt32LE(iy, 36); // ptPixelLocation.y
  buf.writeInt32LE(ix, 40); // ptPixelLocationRaw.x
  buf.writeInt32LE(iy, 44); // ptPixelLocationRaw.y
  buf.writeInt32LE(0, 48); // ptHimetricLocation.x
  buf.writeInt32LE(0, 52); // ptHimetricLocation.y
  buf.writeInt32LE(0, 56); // ptHimetricLocationRaw.x
  buf.writeInt32LE(0, 60); // ptHimetricLocationRaw.y
  // dwTime MUST be non-zero (or PerformanceCount must — never both).
  // We set dwTime; PerformanceCount stays 0. Each successive call has
  // a higher dwTime via the monotonic tickEpoch counter.
  buf.writeUInt32LE(nextTick(), 64);
  buf.writeUInt32LE(0, 68); // historyCount
  buf.writeInt32LE(0, 72); // inputData
  buf.writeUInt32LE(0, 76); // dwKeyStates
  buf.writeBigUInt64LE(0n, 80); // performanceCount = 0 (using dwTime instead)
  buf.writeInt32LE(0, 88); // buttonChangeType (enum)
  // 92-95: trailing struct padding (already zeroed by Buffer.alloc)

  // POINTER_TOUCH_INFO tail (48 bytes)
  buf.writeUInt32LE(TOUCH_FLAG_NONE, 96); // touchFlags
  buf.writeUInt32LE(
    TOUCH_MASK_CONTACTAREA | TOUCH_MASK_ORIENTATION | TOUCH_MASK_PRESSURE,
    100,
  );
  // rcContact (4 × int32)
  buf.writeInt32LE(ix - 2, 104);
  buf.writeInt32LE(iy - 2, 108);
  buf.writeInt32LE(ix + 2, 112);
  buf.writeInt32LE(iy + 2, 116);
  // rcContactRaw (4 × int32)
  buf.writeInt32LE(ix - 2, 120);
  buf.writeInt32LE(iy - 2, 124);
  buf.writeInt32LE(ix + 2, 128);
  buf.writeInt32LE(iy + 2, 132);
  buf.writeUInt32LE(90, 136); // orientation — 90° per the MS sample
  buf.writeUInt32LE(1024, 140); // pressure — top of MSDN 0..1024 range

  return buf;
}

let cached: TouchApi | null = null;

export function getTouchInjector(): TouchApi {
  if (cached) return cached;
  if (!isWindows) {
    cached = unavailable;
    return cached;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi');

    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    // BOOL InitializeTouchInjection(UINT32 maxCount, DWORD dwMode);
    const InitializeTouchInjection = user32.func(
      '__stdcall',
      'InitializeTouchInjection',
      'int32',
      ['uint32', 'uint32'],
    );
    // BOOL InjectTouchInput(UINT32 count, const POINTER_TOUCH_INFO *contacts);
    // We declare contacts as void* and pass a hand-packed Buffer to
    // eliminate any chance of koffi struct-padding bugs.
    const InjectTouchInput = user32.func(
      '__stdcall',
      'InjectTouchInput',
      'int32',
      ['uint32', 'void*'],
    );
    const GetLastError = kernel32.func(
      '__stdcall',
      'GetLastError',
      'uint32',
      [],
    );

    const initOk = InitializeTouchInjection(MAX_CONTACTS, TOUCH_FEEDBACK_NONE);
    if (!initOk) {
      const err = GetLastError();
      logger.warn('InitializeTouchInjection returned 0 — falling back to mouse', {
        lastError: err,
      });
      cached = unavailable;
      return cached;
    }

    // One-time sanity log — confirms our hand-packed struct size matches
    // what Windows expects (144 bytes for POINTER_TOUCH_INFO on x64).
    logger.info('touch injection initialized', {
      maxContacts: MAX_CONTACTS,
      packetBytes: POINTER_TOUCH_INFO_SIZE,
    });

    let lastInjectErrLog = 0;
    let dumpedHex = false;
    function inject(buf: Buffer): boolean {
      try {
        const ok = InjectTouchInput(1, buf);
        if (ok === 0) {
          const now = Date.now();
          if (now - lastInjectErrLog > 1000) {
            lastInjectErrLog = now;
            const err = GetLastError();
            logger.warn('InjectTouchInput returned 0', {
              lastError: err,
              flags: buf.readUInt32LE(12),
              x: buf.readInt32LE(32),
              y: buf.readInt32LE(36),
            });
            if (!dumpedHex) {
              dumpedHex = true;
              // One-time full hex dump so we can verify the byte
              // layout against the Windows headers if touch keeps
              // failing on this host.
              logger.warn('POINTER_TOUCH_INFO bytes', {
                hex: buf.toString('hex'),
                length: buf.length,
              });
            }
          }
          return false;
        }
        return true;
      } catch (err) {
        logger.warn('InjectTouchInput threw', { err: String(err) });
        return false;
      }
    }

    cached = {
      available: true,
      tap(x, y) {
        if (
          !inject(
            packTouchInfo(
              x,
              y,
              POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT,
            ),
          )
        )
          return false;
        return inject(packTouchInfo(x, y, POINTER_FLAG_UP));
      },
      pressDown(x, y) {
        return inject(
          packTouchInfo(
            x,
            y,
            POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT,
          ),
        );
      },
      pressMove(x, y) {
        return inject(
          packTouchInfo(
            x,
            y,
            POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT,
          ),
        );
      },
      pressUp(x, y) {
        return inject(packTouchInfo(x, y, POINTER_FLAG_UP));
      },
    };

    return cached;
  } catch (err) {
    logger.warn('touch injection failed to load — falling back to mouse', {
      err: String(err),
    });
    cached = unavailable;
    return cached;
  }
}
