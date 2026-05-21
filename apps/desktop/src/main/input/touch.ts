/**
 * Windows synthetic touch injection.
 *
 * Wraps user32.dll's `InitializeTouchInjection` + `InjectTouchInput`
 * via koffi so Swoosh can fire taps / drags / pans at arbitrary screen
 * coordinates WITHOUT moving the OS mouse cursor.
 *
 * This is the proper "multiple input" answer on Windows: the OS treats
 * touch and mouse as separate input devices. Modern apps (Chrome,
 * Edge, Firefox, Electron, UWP, Office) handle touch events natively;
 * older apps that don't get automatic touch → mouse promotion from
 * Windows, but even then the cursor isn't yanked away from the user.
 *
 * Privilege note: `InjectTouchInput` will not deliver events to
 * higher-integrity-level windows (e.g., elevated Task Manager) unless
 * the calling process has UIAccess. Same-integrity apps work fine,
 * which covers ~all normal user-app surfaces.
 *
 * On non-Windows platforms `touch.available` is false; callers fall
 * back to the mouse-with-restore path. macOS / Linux equivalents
 * (`CGEventCreate` + trackpad source / uinput) are tracked separately.
 */

import { logger } from '../logger';

const isWindows = process.platform === 'win32';

// Pointer flag bits — see Windows.h. Set on the touch packet to tell
// the OS what kind of event this is (initial down, update, release).
// Microsoft's official sample uses DOWN | INRANGE | INCONTACT for the
// initial press, UPDATE | INRANGE | INCONTACT for moves, and UP alone
// for release. NEW / PRIMARY aren't required and including them
// causes Windows to return ERROR_INVALID_PARAMETER in some cases.
const POINTER_FLAG_INRANGE = 0x00000002;
const POINTER_FLAG_INCONTACT = 0x00000004;
const POINTER_FLAG_DOWN = 0x00010000;
const POINTER_FLAG_UPDATE = 0x00020000;
const POINTER_FLAG_UP = 0x00040000;

// PT_TOUCH discriminator for the POINTER_INFO union.
const PT_TOUCH = 0x00000002;

// Touch feedback mode: NONE suppresses Windows' default ripple ring
// that appears around synthetic touch points — we already render our
// own SwooshCursor.
const TOUCH_FEEDBACK_NONE = 0x3;

// touchMask tells Windows which auxiliary fields in POINTER_TOUCH_INFO
// are valid. Microsoft's TouchInjection sample populates all three
// (contactarea + orientation + pressure); Windows rejects with
// ERROR_INVALID_PARAMETER if you populate a field but don't claim it
// in the mask, or vice versa.
const TOUCH_MASK_CONTACTAREA = 0x00000001;
const TOUCH_MASK_ORIENTATION = 0x00000002;
const TOUCH_MASK_PRESSURE = 0x00000004;
const TOUCH_FLAG_NONE = 0x0;

const MAX_CONTACTS = 10;

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

function buildTouchInfo(
  x: number,
  y: number,
  flags: number,
  pointerId = 0,
): Record<string, unknown> {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const contactRect = {
    left: ix - 2,
    top: iy - 2,
    right: ix + 2,
    bottom: iy + 2,
  };
  return {
    pointerInfo: {
      pointerType: PT_TOUCH,
      pointerId,
      frameId: 0,
      pointerFlags: flags,
      sourceDevice: null,
      hwndTarget: null,
      ptPixelLocation: { x: ix, y: iy },
      ptPixelLocationRaw: { x: ix, y: iy },
      ptHimetricLocation: { x: 0, y: 0 },
      ptHimetricLocationRaw: { x: 0, y: 0 },
      dwTime: 0,
      historyCount: 0,
      inputData: 0,
      dwKeyStates: 0,
      performanceCount: 0n,
      buttonChangeType: 0,
    },
    touchFlags: TOUCH_FLAG_NONE,
    touchMask: TOUCH_MASK_CONTACTAREA | TOUCH_MASK_ORIENTATION | TOUCH_MASK_PRESSURE,
    rcContact: contactRect,
    rcContactRaw: contactRect,
    // Match the Microsoft TouchInjection sample exactly: orientation
    // 90° (palm-down finger), pressure 32000 (mid-range of the 0..65535
    // documented field width despite the MSDN doc page citing 0..1024
    // — the sample uses 32000 and it works).
    orientation: 90,
    pressure: 32000,
  };
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

    // Define the C struct types we'll pass. Field order MUST match
    // the Windows headers exactly — koffi marshals positionally.
    const POINT = koffi.struct('POINT', {
      x: 'int32',
      y: 'int32',
    });
    const RECT = koffi.struct('RECT', {
      left: 'int32',
      top: 'int32',
      right: 'int32',
      bottom: 'int32',
    });
    const POINTER_INFO = koffi.struct('POINTER_INFO', {
      pointerType: 'uint32',
      pointerId: 'uint32',
      frameId: 'uint32',
      pointerFlags: 'uint32',
      sourceDevice: 'void*',
      hwndTarget: 'void*',
      ptPixelLocation: POINT,
      ptPixelLocationRaw: POINT,
      ptHimetricLocation: POINT,
      ptHimetricLocationRaw: POINT,
      dwTime: 'uint32',
      historyCount: 'uint32',
      inputData: 'int32',
      dwKeyStates: 'uint32',
      performanceCount: 'uint64',
      buttonChangeType: 'int32',
    });
    const POINTER_TOUCH_INFO = koffi.struct('POINTER_TOUCH_INFO', {
      pointerInfo: POINTER_INFO,
      touchFlags: 'uint32',
      touchMask: 'uint32',
      rcContact: RECT,
      rcContactRaw: RECT,
      orientation: 'uint32',
      pressure: 'uint32',
    });

    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const InitializeTouchInjection = user32.func(
      '__stdcall',
      'InitializeTouchInjection',
      'int32',
      ['uint32', 'uint32'],
    );
    const InjectTouchInput = user32.func(
      '__stdcall',
      'InjectTouchInput',
      'int32',
      ['uint32', koffi.pointer(POINTER_TOUCH_INFO)],
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

    // Sanity-log the struct sizes so we can confirm the FFI layout
    // matches what Windows expects on this host (POINTER_INFO must be
    // 96 bytes on x64, POINTER_TOUCH_INFO must be 144).
    logger.info('touch injection struct sizes', {
      pointerInfo: koffi.sizeof(POINTER_INFO),
      pointerTouchInfo: koffi.sizeof(POINTER_TOUCH_INFO),
    });

    // Logging is throttled because a failed drag can fire 60 events
    // per second and we don't want to spam the rotating log file.
    let lastInjectErrLog = 0;
    function inject(packet: Record<string, unknown>): boolean {
      try {
        const ok = InjectTouchInput(1, [packet]);
        if (ok === 0) {
          const now = Date.now();
          if (now - lastInjectErrLog > 1000) {
            lastInjectErrLog = now;
            const err = GetLastError();
            const info = packet.pointerInfo as {
              pointerFlags: number;
              ptPixelLocation: { x: number; y: number };
            };
            logger.warn('InjectTouchInput returned 0', {
              lastError: err,
              flags: info.pointerFlags,
              x: info.ptPixelLocation.x,
              y: info.ptPixelLocation.y,
            });
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
        // Down + immediate up. The OS interprets a contact with no
        // movement as a tap → click for legacy apps, touch event for
        // modern apps. Flags match Microsoft's TouchInjection sample.
        const down = buildTouchInfo(
          x,
          y,
          POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT,
        );
        if (!inject(down)) return false;
        const up = buildTouchInfo(x, y, POINTER_FLAG_UP);
        return inject(up);
      },
      pressDown(x, y) {
        return inject(
          buildTouchInfo(
            x,
            y,
            POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT,
          ),
        );
      },
      pressMove(x, y) {
        return inject(
          buildTouchInfo(
            x,
            y,
            POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT,
          ),
        );
      },
      pressUp(x, y) {
        return inject(buildTouchInfo(x, y, POINTER_FLAG_UP));
      },
    };

    logger.info('touch injection initialized', { maxContacts: MAX_CONTACTS });
    return cached;
  } catch (err) {
    logger.warn('touch injection failed to load — falling back to mouse', {
      err: String(err),
    });
    cached = unavailable;
    return cached;
  }
}
