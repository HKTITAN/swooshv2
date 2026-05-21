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
const POINTER_FLAG_NEW = 0x00000001;
const POINTER_FLAG_INRANGE = 0x00000002;
const POINTER_FLAG_INCONTACT = 0x00000004;
const POINTER_FLAG_PRIMARY = 0x00002000;
const POINTER_FLAG_DOWN = 0x00010000;
const POINTER_FLAG_UPDATE = 0x00020000;
const POINTER_FLAG_UP = 0x00040000;

// PT_TOUCH discriminator for the POINTER_INFO union.
const PT_TOUCH = 0x00000002;

// Touch feedback mode: NONE suppresses Windows' default ripple ring
// that appears around synthetic touch points — we already render our
// own SwooshCursor.
const TOUCH_FEEDBACK_NONE = 0x3;

// Touch mask + flags. We don't supply orientation/pressure, so the
// mask is zero and Windows uses defaults.
const TOUCH_MASK_NONE = 0x0;
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
  const contactRect = {
    left: Math.round(x) - 2,
    top: Math.round(y) - 2,
    right: Math.round(x) + 2,
    bottom: Math.round(y) + 2,
  };
  return {
    pointerInfo: {
      pointerType: PT_TOUCH,
      pointerId,
      frameId: 0,
      pointerFlags: flags,
      sourceDevice: null,
      hwndTarget: null,
      ptPixelLocation: { x: Math.round(x), y: Math.round(y) },
      ptPixelLocationRaw: { x: Math.round(x), y: Math.round(y) },
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
    touchMask: TOUCH_MASK_NONE,
    rcContact: contactRect,
    rcContactRaw: contactRect,
    orientation: 0,
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

    const initOk = InitializeTouchInjection(MAX_CONTACTS, TOUCH_FEEDBACK_NONE);
    if (!initOk) {
      logger.warn('InitializeTouchInjection returned 0 — falling back to mouse');
      cached = unavailable;
      return cached;
    }

    function inject(packet: Record<string, unknown>): boolean {
      try {
        const ok = InjectTouchInput(1, [packet]);
        return ok !== 0;
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
        // modern apps.
        const down = buildTouchInfo(
          x,
          y,
          POINTER_FLAG_NEW |
            POINTER_FLAG_INRANGE |
            POINTER_FLAG_INCONTACT |
            POINTER_FLAG_DOWN |
            POINTER_FLAG_PRIMARY,
        );
        if (!inject(down)) return false;
        // Touch up — Windows treats a contact under ~50 ms as a tap.
        // We send the UP packet synchronously; the kernel sequences
        // the two events correctly.
        const up = buildTouchInfo(
          x,
          y,
          POINTER_FLAG_UP | POINTER_FLAG_PRIMARY,
        );
        return inject(up);
      },
      pressDown(x, y) {
        return inject(
          buildTouchInfo(
            x,
            y,
            POINTER_FLAG_NEW |
              POINTER_FLAG_INRANGE |
              POINTER_FLAG_INCONTACT |
              POINTER_FLAG_DOWN |
              POINTER_FLAG_PRIMARY,
          ),
        );
      },
      pressMove(x, y) {
        return inject(
          buildTouchInfo(
            x,
            y,
            POINTER_FLAG_INRANGE |
              POINTER_FLAG_INCONTACT |
              POINTER_FLAG_UPDATE |
              POINTER_FLAG_PRIMARY,
          ),
        );
      },
      pressUp(x, y) {
        return inject(buildTouchInfo(x, y, POINTER_FLAG_UP | POINTER_FLAG_PRIMARY));
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
