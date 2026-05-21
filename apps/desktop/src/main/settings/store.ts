/**
 * Settings store — persists UserSettings to JSON via electron-store and
 * exposes a small, type-safe API for the rest of the main process.
 *
 * Every write broadcasts `settings:changed` to all renderers so the
 * overlay/settings UI can react without polling.
 *
 * Validation: every read and write is run through the Zod schema. If
 * a corrupted file is found on disk, we fall back to defaults rather
 * than crash — the user's gestures should keep working even if their
 * settings file is hand-edited into nonsense.
 */

import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import {
  DEFAULT_USER_SETTINGS,
  IPC,
  type UserSettings,
} from '@swoosh/shared/ipc';
import {
  parseOrDefault,
  userSettingsPatchSchema,
} from '@swoosh/shared/settings.schema';
import { logger } from '../logger';

// electron-store@8 is CJS and types the constructor as a default export
// that's awkward to import from ESM TS. The runtime value is what we
// need; the typing here uses Store<UserSettings>.
type StoreCtor = new (options?: ConstructorParameters<typeof Store>[0]) => Store<UserSettings>;
const StoreClass = (Store as unknown as { default?: StoreCtor }).default ?? (Store as unknown as StoreCtor);

const STORE_KEY = 'settings';

export interface SettingsStore {
  get(): UserSettings;
  set(patch: Partial<UserSettings>): UserSettings;
  on(event: 'changed', listener: (s: UserSettings) => void): void;
  off(event: 'changed', listener: (s: UserSettings) => void): void;
}

export function createSettingsStore(): SettingsStore {
  const store = new StoreClass({ name: 'swoosh-settings' });
  const emitter = new EventEmitter();

  // Load with validation; corrupt files fall back to defaults.
  const initial = store.get(STORE_KEY);
  const { settings, ok, error } = parseOrDefault(initial);
  if (!ok) {
    logger.warn('Settings file failed validation, using defaults', {
      issues: error?.issues,
    });
    store.set(STORE_KEY, settings);
  } else if (initial === undefined) {
    // First run: persist defaults so the file exists on disk.
    store.set(STORE_KEY, settings);
  }

  function readCurrent(): UserSettings {
    const raw = store.get(STORE_KEY);
    const result = parseOrDefault(raw);
    return result.settings;
  }

  function broadcastChanged(s: UserSettings): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.settingsChanged, s);
      }
    }
    emitter.emit('changed', s);
  }

  return {
    get(): UserSettings {
      return readCurrent();
    },
    set(patch: Partial<UserSettings>): UserSettings {
      const parsedPatch = userSettingsPatchSchema.safeParse(patch);
      if (!parsedPatch.success) {
        logger.warn('Rejected invalid settings patch', {
          issues: parsedPatch.error.issues,
        });
        return readCurrent();
      }
      const current = readCurrent();
      const merged: UserSettings = { ...current, ...parsedPatch.data };

      // Re-validate the merged result so partial patches can't break
      // cross-field invariants (e.g., enter < exit thresholds).
      const finalCheck = parseOrDefault(merged);
      if (!finalCheck.ok) {
        logger.warn('Settings patch produced invalid combined state', {
          issues: finalCheck.error?.issues,
        });
        return current;
      }

      store.set(STORE_KEY, finalCheck.settings);
      broadcastChanged(finalCheck.settings);
      return finalCheck.settings;
    },
    on(event, listener) {
      emitter.on(event, listener);
    },
    off(event, listener) {
      emitter.off(event, listener);
    },
  };
}

export { DEFAULT_USER_SETTINGS };
