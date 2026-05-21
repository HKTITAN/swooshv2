/**
 * Settings window (US5).
 *
 * 960×720 centered, themed. Hides on close instead of destroying so
 * reopening from the tray feels instant — there's no pipeline restart
 * cost on the main side (the renderer's preview pipeline lifecycle is
 * managed by the React app there).
 *
 * Created lazily on first request from the tray's "Settings" menu item.
 */

import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger';

let settingsWindow: BrowserWindow | null = null;

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

export function openSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (!settingsWindow.isVisible()) settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  const display = screen.getPrimaryDisplay();
  const winWidth = 960;
  const winHeight = 720;
  const x = Math.round(display.bounds.x + (display.bounds.width - winWidth) / 2);
  const y = Math.round(display.bounds.y + (display.bounds.height - winHeight) / 2);

  settingsWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    show: true,
    backgroundColor: '#0E1230',
    title: 'Swoosh — Settings',
    autoHideMenuBar: true,
    resizable: true,
    minWidth: 800,
    minHeight: 600,
    fullscreenable: false,
    minimizable: true,
    maximizable: true,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Intercept close — hide instead of destroying so reopening is instant.
  // The user can fully close Swoosh from the tray menu.
  settingsWindow.on('close', (event) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  const url = resolveRendererEntry('settings');
  settingsWindow.loadURL(url).catch((err) => {
    logger.error('settings.loadURL failed', { url, err: String(err) });
  });

  logger.info('settings window opened', { url });

  return settingsWindow;
}

/** Destroy the settings window on app quit. */
export function destroySettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.removeAllListeners('close');
    settingsWindow.destroy();
  }
  settingsWindow = null;
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
