/**
 * System tray — Swoosh's persistent presence on Windows/Linux and the
 * macOS menu bar. Holds Pause/Resume, Settings, Replay Tutorial, About,
 * Quit. The icon visually reflects state (active / paused / no-camera).
 *
 * Implementation note: until proper PNG icons land in
 * `apps/desktop/resources/icons/tray/` (T702), we draw a programmatic
 * `nativeImage` so Swoosh has a visible tray icon from day one.
 */

import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import { logger } from './logger';
import type { TrackingState } from '@swoosh/shared/ipc';

export type TrayState = 'active' | 'paused' | 'noCamera';

export interface TrayController {
  setState(state: TrayState): void;
  setOnPauseResume(handler: () => void): void;
  setOnOpenSettings(handler: () => void): void;
  setOnReplayTutorial(handler: () => void): void;
  setOnQuit(handler: () => void): void;
  setOnOpenAbout(handler: () => void): void;
  destroy(): void;
}

function generateIcon(state: TrayState): Electron.NativeImage {
  // Programmatic 32x32 RGBA buffer with a colored circle. Replaces with
  // real PNG assets in T702.
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const palette: Record<TrayState, [number, number, number]> = {
    active: [0x3f, 0xe0, 0xc5],
    paused: [0xff, 0xd5, 0x6b],
    noCamera: [0xff, 0x6b, 0x9d],
  };
  const [r, g, b] = palette[state];
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size / 2 - 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius) {
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        // Soft AA at the edge.
        const aa = Math.max(0, Math.min(1, radius - d));
        buf[i + 3] = Math.round(255 * Math.min(1, aa + 0.4));
      } else {
        buf[i + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

export function createTray(): TrayController {
  let tray: Tray | null = null;
  let currentState: TrayState = 'active';
  const handlers: {
    pauseResume?: () => void;
    settings?: () => void;
    tutorial?: () => void;
    quit?: () => void;
    about?: () => void;
  } = {};

  function buildMenu(state: TrayState): Menu {
    const items: MenuItemConstructorOptions[] = [
      {
        label: state === 'paused' ? 'Resume tracking' : 'Pause tracking',
        click: () => handlers.pauseResume?.(),
        accelerator: 'CommandOrControl+Alt+Space',
      },
      { type: 'separator' },
      { label: 'Settings…', click: () => handlers.settings?.() },
      { label: 'Replay tutorial', click: () => handlers.tutorial?.() },
      { type: 'separator' },
      { label: 'About Swoosh', click: () => handlers.about?.() },
      {
        label: 'Quit Swoosh',
        click: () => handlers.quit?.(),
        accelerator: 'CommandOrControl+Q',
      },
    ];
    return Menu.buildFromTemplate(items);
  }

  function init(): void {
    if (tray) return;
    try {
      tray = new Tray(generateIcon(currentState));
      tray.setToolTip('Swoosh — Hand tracker');
      tray.setContextMenu(buildMenu(currentState));
      // On macOS, left-click typically opens the popover instead of the
      // context menu — T701 wires that. For now, treat both as menu open.
      tray.on('click', () => {
        if (tray) tray.popUpContextMenu();
      });
      logger.info('tray created', { state: currentState });
    } catch (err) {
      logger.error('tray creation failed', { err: String(err) });
    }
  }

  app.whenReady().then(init);

  return {
    setState(state) {
      currentState = state;
      if (!tray) return;
      tray.setImage(generateIcon(state));
      tray.setContextMenu(buildMenu(state));
    },
    setOnPauseResume(h) {
      handlers.pauseResume = h;
    },
    setOnOpenSettings(h) {
      handlers.settings = h;
    },
    setOnReplayTutorial(h) {
      handlers.tutorial = h;
    },
    setOnQuit(h) {
      handlers.quit = h;
    },
    setOnOpenAbout(h) {
      handlers.about = h;
    },
    destroy() {
      tray?.destroy();
      tray = null;
    },
  };
}

export function trayStateFor(t: TrackingState): TrayState {
  switch (t.kind) {
    case 'active':
      return 'active';
    case 'paused':
      return 'paused';
    case 'noCamera':
    case 'permissionDenied':
    case 'cameraInUse':
      return 'noCamera';
  }
}
