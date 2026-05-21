/**
 * Tray popover window (T700/T701).
 *
 * A small frameless window anchored near the tray icon. Opens on
 * left-click of the tray; hides on blur, on tray click while visible
 * (toggle), or after the user picks an action.
 *
 * Acts as a quick-action surface — pause/resume, audio toggle, plus
 * shortcuts to Settings, Tutorial, About, Quit. Reflects live
 * tracking + settings state via the existing `tracking:state` and
 * `settings:changed` broadcasts in the preload bridge.
 */

import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger';

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 280;
const TRAY_GAP = 8;

let popover: BrowserWindow | null = null;

function resolvePreload(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- import.meta is allowed in the bundled main
  const here = fileURLToPath((import.meta as any).url);
  return join(here, '..', '..', 'preload', 'index.js');
}

function resolveRendererEntry(name: string): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html`;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const here = fileURLToPath((import.meta as any).url);
  return `file://${join(here, '..', '..', 'renderer', name, 'index.html').replace(/\\/g, '/')}`;
}

function ensureWindow(): BrowserWindow {
  if (popover && !popover.isDestroyed()) return popover;

  popover = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#0E1230',
    alwaysOnTop: true,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Hide on blur — clicking outside dismisses the popover.
  popover.on('blur', () => {
    if (popover && !popover.isDestroyed()) popover.hide();
  });

  popover.on('closed', () => {
    popover = null;
  });

  const url = resolveRendererEntry('tray-popover');
  popover.loadURL(url).catch((err) => {
    logger.error('tray-popover.loadURL failed', { url, err: String(err) });
  });

  return popover;
}

/**
 * Compute the popover origin in screen coordinates, anchored to the
 * tray icon when its bounds are known. Falls back to the cursor.
 *
 * Tray bounds are accurate on Windows. On macOS the menu bar icon
 * has bounds, but the popover should hang from below the bar. On
 * Linux X11 bounds are often zeroed by some panels; fall back to
 * cursor.
 */
function positionFor(trayBounds: Rectangle | null): { x: number; y: number } {
  const display = screen.getPrimaryDisplay();
  let x: number;
  let y: number;

  if (trayBounds && trayBounds.width > 0) {
    const trayCx = trayBounds.x + trayBounds.width / 2;
    x = Math.round(trayCx - POPOVER_WIDTH / 2);
    // If the tray sits in the bottom half of the screen, anchor above it;
    // otherwise hang below.
    const screenCy = display.workArea.y + display.workArea.height / 2;
    if (trayBounds.y >= screenCy) {
      y = Math.round(trayBounds.y - POPOVER_HEIGHT - TRAY_GAP);
    } else {
      y = Math.round(trayBounds.y + trayBounds.height + TRAY_GAP);
    }
  } else {
    const cursor = screen.getCursorScreenPoint();
    x = cursor.x - POPOVER_WIDTH / 2;
    // Anchor above the cursor on Windows-style bottom trays.
    y = cursor.y - POPOVER_HEIGHT - TRAY_GAP;
  }

  // Clamp inside the work area.
  const wa = display.workArea;
  x = Math.max(wa.x + TRAY_GAP, Math.min(x, wa.x + wa.width - POPOVER_WIDTH - TRAY_GAP));
  y = Math.max(wa.y + TRAY_GAP, Math.min(y, wa.y + wa.height - POPOVER_HEIGHT - TRAY_GAP));

  return { x, y };
}

/**
 * Toggle the popover. If visible, hides; otherwise positions near
 * the tray icon and shows.
 */
export function toggleTrayPopover(trayBounds: Rectangle | null): void {
  const win = ensureWindow();
  if (win.isVisible()) {
    win.hide();
    return;
  }
  const { x, y } = positionFor(trayBounds);
  win.setBounds({ x, y, width: POPOVER_WIDTH, height: POPOVER_HEIGHT });
  win.show();
  win.focus();
}

export function hideTrayPopover(): void {
  if (popover && !popover.isDestroyed() && popover.isVisible()) {
    popover.hide();
  }
}

export function destroyTrayPopover(): void {
  if (popover && !popover.isDestroyed()) popover.destroy();
  popover = null;
}
