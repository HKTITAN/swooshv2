/**
 * Overlay window — frameless, transparent, always-on-top, click-through.
 *
 * This window covers the active monitor and renders the hand outline
 * on top of every other window. It is the ONLY window that opens the
 * webcam during normal use; the settings preview opens a second
 * MediaStream only while visible.
 *
 * Implementation notes:
 *  - `setIgnoreMouseEvents(true, { forward: true })` makes the window
 *    pass-through to mouse input AND still forward `pointermove` to
 *    the renderer for cursor-following effects.
 *  - We follow the primary display's working area and re-bind on
 *    `display-added/removed/metrics-changed`.
 *  - Transparency requires `backgroundColor: '#00000000'` (note the
 *    alpha channel) on macOS/Linux; Windows respects the same.
 */

import { BrowserWindow, screen, type Display } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger';
import { IPC, type ScreenBounds } from '@swoosh/shared/ipc';

let overlayWindow: BrowserWindow | null = null;

function resolvePreload(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function applyBounds(win: BrowserWindow, display: Display): void {
  const wa = display.workArea;
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
  const bounds: ScreenBounds = {
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    scaleFactor: display.scaleFactor,
  };
  win.webContents.send(IPC.overlayResize, bounds);
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show();
    return overlayWindow;
  }

  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;

  overlayWindow = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    show: true,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Float above everything (incl. fullscreen apps on macOS).
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Click-through with forward so the renderer still sees pointer
  // movements for any UI hints, but the window doesn't steal clicks.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Track display changes so the overlay always covers the active monitor.
  const onDisplayChange = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const d = screen.getPrimaryDisplay();
    applyBounds(overlayWindow, d);
  };
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
  screen.on('display-metrics-changed', onDisplayChange);
  overlayWindow.on('closed', () => {
    screen.off('display-added', onDisplayChange);
    screen.off('display-removed', onDisplayChange);
    screen.off('display-metrics-changed', onDisplayChange);
  });

  const url = resolveRendererEntry('overlay');
  overlayWindow.loadURL(url).catch((err) => {
    logger.error('overlay.loadURL failed', { url, err: String(err) });
  });

  logger.info('overlay window opened', { url });

  return overlayWindow;
}

export function closeOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function hideOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
}
export function showOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.show();
}
