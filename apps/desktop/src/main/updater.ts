/**
 * Auto-update wiring (T900-T902).
 *
 * Uses electron-updater against GitHub Releases (provider configured
 * in apps/desktop/electron-builder.yml — `owner` still set to a TODO
 * placeholder until the repo is named).
 *
 * Behavior:
 *   - On bootstrap, if `settings.updateChecksEnabled` is true and the
 *     last check was more than 24 h ago (or never), schedule a check
 *     a few seconds after startup (so it doesn't compete with the
 *     overlay's MediaPipe load).
 *   - On `update-available`, broadcast `update:available` to all
 *     renderers so the settings panel and tray popover can react.
 *   - On `update-downloaded`, expose `install()` so the renderer can
 *     trigger a quitAndInstall on user confirmation.
 *
 * Privacy: this is the ONLY network call Swoosh makes. The user can
 * disable it in settings; we honor that without polling. No telemetry
 * or analytics is sent — `electron-updater` only fetches the release
 * manifest from the configured provider URL.
 */

import { BrowserWindow, app } from 'electron';
import { IPC, type UpdateCheckResult } from '@swoosh/shared/ipc';
import { logger } from './logger';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 8000;

interface UpdaterDeps {
  /** Read whether update checks are user-enabled. */
  getEnabled: () => boolean;
  /** ISO timestamp of the last check, or null. */
  getLastCheckIso: () => string | null;
  /** Persist a new last-check timestamp. */
  setLastCheckIso: (iso: string) => void;
}

export interface Updater {
  /** Manual check (e.g., from settings → Diagnostics). */
  check(): Promise<UpdateCheckResult>;
  /** Apply a downloaded update and restart. */
  install(): Promise<void>;
  /** Begin the debounced background checks. */
  start(): void;
  /** Stop background checks (called on quit). */
  stop(): void;
}

interface ElectronUpdaterShape {
  autoUpdater: {
    setFeedURL?: (options: unknown) => void;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    checkForUpdates: () => Promise<unknown>;
    quitAndInstall: (silent?: boolean, restart?: boolean) => void;
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    logger?: unknown;
  };
}

let cached: ElectronUpdaterShape | null = null;

/**
 * Lazy-require electron-updater. Wrapped in a try so dev environments
 * without code signing still boot — electron-updater throws on missing
 * publish config which we handle gracefully.
 */
function getElectronUpdater(): ElectronUpdaterShape | null {
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime require keeps this optional
    cached = require('electron-updater') as ElectronUpdaterShape;
    return cached;
  } catch (err) {
    logger.warn('electron-updater unavailable; auto-update disabled', {
      err: String(err),
    });
    return null;
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

export function createUpdater(deps: UpdaterDeps): Updater {
  let timer: NodeJS.Timeout | null = null;
  let lastResult: UpdateCheckResult = {
    current: app.getVersion(),
    hasUpdate: false,
  };

  function wireListeners(): void {
    const mod = getElectronUpdater();
    if (!mod) return;
    const u = mod.autoUpdater;
    u.autoDownload = true;
    u.autoInstallOnAppQuit = false;
    u.on('checking-for-update', () => {
      logger.info('update: checking');
    });
    u.on('update-available', (info: unknown) => {
      const i = info as { version?: string; releaseNotes?: string };
      logger.info('update: available', { version: i.version });
      lastResult = {
        current: app.getVersion(),
        latest: i.version,
        hasUpdate: true,
      };
      broadcast(IPC.updateAvailable, { version: i.version ?? '?', notes: i.releaseNotes });
    });
    u.on('update-not-available', () => {
      logger.info('update: none');
      lastResult = { current: app.getVersion(), hasUpdate: false };
    });
    u.on('download-progress', (p: unknown) => {
      const pr = p as { percent?: number };
      if (typeof pr.percent === 'number') broadcast(IPC.updateProgress, pr.percent);
    });
    u.on('update-downloaded', (info: unknown) => {
      const i = info as { version?: string };
      logger.info('update: downloaded', { version: i.version });
    });
    u.on('error', (err: unknown) => {
      logger.warn('update: error', { err: String(err) });
    });
  }

  async function doCheck(): Promise<UpdateCheckResult> {
    deps.setLastCheckIso(new Date().toISOString());
    const mod = getElectronUpdater();
    if (!mod) {
      lastResult = { current: app.getVersion(), hasUpdate: false };
      return lastResult;
    }
    try {
      await mod.autoUpdater.checkForUpdates();
      return lastResult;
    } catch (err) {
      logger.warn('update: check threw', { err: String(err) });
      lastResult = { current: app.getVersion(), hasUpdate: false };
      return lastResult;
    }
  }

  function scheduleNext(): void {
    if (timer) clearTimeout(timer);
    if (!deps.getEnabled()) return;
    const lastIso = deps.getLastCheckIso();
    const lastTs = lastIso ? Date.parse(lastIso) : 0;
    const due = lastTs + CHECK_INTERVAL_MS - Date.now();
    const delay = Math.max(STARTUP_DELAY_MS, due);
    timer = setTimeout(() => {
      void doCheck().then(scheduleNext);
    }, delay);
  }

  return {
    async check() {
      return doCheck();
    },
    async install() {
      const mod = getElectronUpdater();
      if (!mod) return;
      // quitAndInstall(silent: false, restart: true) — standard restart-to-update.
      mod.autoUpdater.quitAndInstall(false, true);
    },
    start() {
      wireListeners();
      scheduleNext();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
