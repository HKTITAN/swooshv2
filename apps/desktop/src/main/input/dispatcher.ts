/**
 * Input dispatcher — the only place in the app that touches nut.js.
 *
 * The renderer never imports this; gestures flow renderer → IPC → main →
 * gestureRouter → dispatcher → nut.js → OS.
 *
 * nut.js has native bindings that may fail to load on some platforms
 * (notably bare Wayland, or when the input group permission is missing
 * on Linux). We treat that as a soft failure: log a warning, expose
 * no-op implementations, and let the rest of the app keep running so
 * the user can see the overlay and configure things even if their
 * gestures can't drive the OS yet.
 */

import { screen } from 'electron';
import { logger } from '../logger';

export type MouseButton = 'left' | 'right' | 'middle';

export interface InputDispatcher {
  /** Available is false when nut.js failed to load. */
  readonly available: boolean;
  moveCursor(x: number, y: number): Promise<void>;
  click(button: MouseButton): Promise<void>;
  mouseDown(button: MouseButton): Promise<void>;
  mouseUp(button: MouseButton): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;
  /** Send a key combination like "alt+tab" or "control+shift+tab". */
  keystroke(combo: string): Promise<void>;
  /**
   * Read the current OS cursor position in logical screen pixels.
   * Used by the gesture router to save → click → restore the
   * physical mouse around hand-driven actions, so the user's mouse
   * cursor isn't "stolen" by Swoosh.
   */
  getCursorPosition(): { x: number; y: number };
}

interface NutModule {
  mouse: {
    setPosition: (point: { x: number; y: number }) => Promise<unknown>;
    leftClick: () => Promise<unknown>;
    rightClick: () => Promise<unknown>;
    pressButton: (button: number) => Promise<unknown>;
    releaseButton: (button: number) => Promise<unknown>;
    scrollUp: (n: number) => Promise<unknown>;
    scrollDown: (n: number) => Promise<unknown>;
    scrollLeft: (n: number) => Promise<unknown>;
    scrollRight: (n: number) => Promise<unknown>;
    config: { mouseSpeed: number };
  };
  keyboard: {
    pressKey: (...keys: number[]) => Promise<unknown>;
    releaseKey: (...keys: number[]) => Promise<unknown>;
    type: (text: string) => Promise<unknown>;
  };
  Button: { LEFT: number; RIGHT: number; MIDDLE: number };
  Key: Record<string, number>;
  Point: new (x: number, y: number) => { x: number; y: number };
  straightTo?: (target: { x: number; y: number }) => unknown;
}

let nut: NutModule | null = null;
let loadAttempted = false;

function tryLoadNut(): NutModule | null {
  if (loadAttempted) return nut;
  loadAttempted = true;
  try {
    // require so that a failure here doesn't propagate as an ESM import error
    // at module evaluation time. nut.js is a hard CJS dep.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@nut-tree-fork/nut-js') as NutModule;
    nut = mod;
    // Disable nut.js's built-in motion easing — we already smooth in
    // the renderer with the 1-Euro filter. Speed = 0 means "warp" the
    // cursor to the target position.
    if (mod.mouse?.config) {
      mod.mouse.config.mouseSpeed = 0;
    }
    logger.info('nut.js loaded successfully');
    return nut;
  } catch (err) {
    logger.warn('nut.js failed to load — OS input will be a no-op', { err: String(err) });
    return null;
  }
}

function btn(nutMod: NutModule, button: MouseButton): number {
  switch (button) {
    case 'left':
      return nutMod.Button.LEFT;
    case 'right':
      return nutMod.Button.RIGHT;
    case 'middle':
      return nutMod.Button.MIDDLE;
  }
}

function noop(): InputDispatcher {
  return {
    available: false,
    async moveCursor() {},
    async click() {},
    async mouseDown() {},
    async mouseUp() {},
    async scroll() {},
    async keystroke() {},
    getCursorPosition() {
      return screen.getCursorScreenPoint();
    },
  };
}

export function createInputDispatcher(): InputDispatcher {
  const mod = tryLoadNut();
  if (!mod) return noop();

  return {
    available: true,
    async moveCursor(x, y) {
      try {
        await mod.mouse.setPosition(new mod.Point(x, y));
      } catch (err) {
        logger.warn('moveCursor failed', { err: String(err) });
      }
    },
    async click(button) {
      try {
        if (button === 'left') await mod.mouse.leftClick();
        else if (button === 'right') await mod.mouse.rightClick();
        else {
          const b = btn(mod, button);
          await mod.mouse.pressButton(b);
          await mod.mouse.releaseButton(b);
        }
      } catch (err) {
        logger.warn('click failed', { err: String(err) });
      }
    },
    async mouseDown(button) {
      try {
        await mod.mouse.pressButton(btn(mod, button));
      } catch (err) {
        logger.warn('mouseDown failed', { err: String(err) });
      }
    },
    async mouseUp(button) {
      try {
        await mod.mouse.releaseButton(btn(mod, button));
      } catch (err) {
        logger.warn('mouseUp failed', { err: String(err) });
      }
    },
    async scroll(dx, dy) {
      try {
        // nut.js wheel APIs are direction-specific; positive dy = scroll down.
        if (dy > 0) await mod.mouse.scrollDown(Math.round(dy));
        else if (dy < 0) await mod.mouse.scrollUp(Math.round(-dy));
        if (dx > 0) await mod.mouse.scrollRight(Math.round(dx));
        else if (dx < 0) await mod.mouse.scrollLeft(Math.round(-dx));
      } catch (err) {
        logger.warn('scroll failed', { err: String(err) });
      }
    },
    getCursorPosition() {
      // Use Electron's screen API rather than nut.js's mouse.getPosition
      // so this works even when nut.js partially loads. Returns
      // logical-pixel coordinates on the display containing the cursor.
      return screen.getCursorScreenPoint();
    },
    async keystroke(combo) {
      // Combo format: "control+shift+tab" → resolve names to nut Key codes.
      const parts = combo.split('+').map((p) => p.trim());
      const keyMap: Record<string, string> = {
        ctrl: 'LeftControl',
        control: 'LeftControl',
        shift: 'LeftShift',
        alt: 'LeftAlt',
        cmd: 'LeftSuper',
        command: 'LeftSuper',
        meta: 'LeftSuper',
        super: 'LeftSuper',
        win: 'LeftSuper',
        tab: 'Tab',
        space: 'Space',
        enter: 'Return',
        escape: 'Escape',
        esc: 'Escape',
      };
      const resolved: number[] = [];
      for (const part of parts) {
        const name = keyMap[part.toLowerCase()] ?? part.toUpperCase();
        const code = mod.Key[name];
        if (typeof code === 'number') resolved.push(code);
        else {
          logger.warn('keystroke: unknown key', { part, combo });
        }
      }
      if (resolved.length === 0) return;
      try {
        await mod.keyboard.pressKey(...resolved);
        await mod.keyboard.releaseKey(...resolved.slice().reverse());
      } catch (err) {
        logger.warn('keystroke failed', { err: String(err) });
      }
    },
  };
}
