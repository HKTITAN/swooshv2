import { describe, expect, it } from 'vitest';
import {
  parseOrDefault,
  userSettingsPatchSchema,
  userSettingsSchema,
} from './settings.schema';
import { DEFAULT_USER_SETTINGS } from './ipc';

describe('settings.schema', () => {
  it('accepts DEFAULT_USER_SETTINGS as a valid object', () => {
    expect(userSettingsSchema.safeParse(DEFAULT_USER_SETTINGS).success).toBe(true);
  });

  it('round-trips a valid settings object through parseOrDefault', () => {
    const { settings, ok, error } = parseOrDefault(DEFAULT_USER_SETTINGS);
    expect(ok).toBe(true);
    expect(error).toBeUndefined();
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('falls back to defaults on completely bogus input', () => {
    const { settings, ok } = parseOrDefault({ wholly: 'wrong' });
    expect(ok).toBe(false);
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('falls back to defaults on null', () => {
    const { settings, ok } = parseOrDefault(null);
    expect(ok).toBe(false);
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('rejects settings where exit threshold ≤ enter threshold (hysteresis invariant)', () => {
    const bad = { ...DEFAULT_USER_SETTINGS, pinchEnterThreshold: 0.1, pinchExitThreshold: 0.1 };
    const { ok } = parseOrDefault(bad);
    expect(ok).toBe(false);
  });

  it('rejects unknown outlineStyle values', () => {
    const bad = { ...DEFAULT_USER_SETTINGS, outlineStyle: 'rainbow' };
    expect(userSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects pinchEnterThreshold outside [0,1]', () => {
    const bad = { ...DEFAULT_USER_SETTINGS, pinchEnterThreshold: 2 };
    expect(userSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects fps values other than 30 or 60', () => {
    const bad = { ...DEFAULT_USER_SETTINGS, fps: 45 };
    expect(userSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a minimal partial patch through the patch schema', () => {
    const result = userSettingsPatchSchema.safeParse({ audioVolume: 0.8 });
    expect(result.success).toBe(true);
  });

  it('rejects a partial patch with out-of-range audio volume', () => {
    expect(userSettingsPatchSchema.safeParse({ audioVolume: 2 }).success).toBe(false);
  });

  it('accepts settings with cameraId set to null', () => {
    expect(
      userSettingsSchema.safeParse({ ...DEFAULT_USER_SETTINGS, cameraId: null }).success,
    ).toBe(true);
  });

  it('accepts settings with a non-null cameraId string', () => {
    expect(
      userSettingsSchema.safeParse({ ...DEFAULT_USER_SETTINGS, cameraId: 'webcam-1' }).success,
    ).toBe(true);
  });
});
