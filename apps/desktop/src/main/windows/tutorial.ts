/**
 * Tutorial window — first-run walkthrough that guarantees a working
 * pinch-click within 60 seconds (per User Story 1).
 *
 * 1024×720 centered, themed dark background, frameless title bar
 * affordance via Electron's autoHideMenuBar. The renderer entry is
 * `tutorial/index.html`, mounted in electron.vite.config.ts.
 *
 * Lifecycle:
 *  - createTutorialWindow() returns the BrowserWindow; tracks it so
 *    repeated calls focus the existing window instead of opening a
 *    second.
 *  - close() resolves a promise the orchestrator (main/index.ts) can
 *    await before opening the overlay.
 */

import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger';

let tutorialWindow: BrowserWindow | null = null;

function resolvePreload(): string {
  // In dev/build, electron-vite outputs preload to out/preload/index.js relative
  // to the main bundle. import.meta.url points at the running main file inside
  // out/main/, so the preload sits two directories away.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- import.meta is allowed in the bundled main
  const here = fileURLToPath((import.meta as any).url);
  return join(here, '..', '..', 'preload', 'index.js');
}

function resolveRendererEntry(name: string): string {
  // electron-vite serves the renderer over an HTTP dev server in dev mode
  // and emits static HTML files into out/renderer/<entry>/ in production.
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html`;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const here = fileURLToPath((import.meta as any).url);
  return `file://${join(here, '..', '..', 'renderer', name, 'index.html').replace(/\\/g, '/')}`;
}

export function createTutorialWindow(): BrowserWindow {
  if (tutorialWindow && !tutorialWindow.isDestroyed()) {
    tutorialWindow.show();
    tutorialWindow.focus();
    return tutorialWindow;
  }

  const display = screen.getPrimaryDisplay();
  const winWidth = 1024;
  const winHeight = 720;
  const x = Math.round(display.bounds.x + (display.bounds.width - winWidth) / 2);
  const y = Math.round(display.bounds.y + (display.bounds.height - winHeight) / 2);

  tutorialWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    show: true,
    backgroundColor: '#0E1230',
    title: 'Swoosh — Setup',
    autoHideMenuBar: true,
    resizable: false,
    fullscreenable: false,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  tutorialWindow.on('closed', () => {
    tutorialWindow = null;
  });

  const url = resolveRendererEntry('tutorial');
  tutorialWindow.loadURL(url).catch((err) => {
    logger.error('tutorial.loadURL failed', { url, err: String(err) });
  });

  logger.info('tutorial window opened', { url });

  return tutorialWindow;
}

export function closeTutorialWindow(): void {
  if (tutorialWindow && !tutorialWindow.isDestroyed()) {
    tutorialWindow.close();
  }
  tutorialWindow = null;
}

export function getTutorialWindow(): BrowserWindow | null {
  return tutorialWindow;
}
