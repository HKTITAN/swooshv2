/**
 * Zod schema for UserSettings. Used by:
 *  - main process settings store (electron-store) to validate the
 *    on-disk JSON before exposing it to the rest of the app
 *  - any renderer that wants to defensively parse settings received
 *    over IPC
 *
 * If validation fails on load, the store falls back to DEFAULT_USER_SETTINGS
 * (via parseOrDefault). Partial patches are validated against the partial
 * schema before being merged.
 */

import { z } from 'zod';
import { DEFAULT_USER_SETTINGS, type UserSettings } from './ipc';

const resolutionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const smoothingSchema = z.object({
  minCutoff: z.number().positive(),
  beta: z.number().min(0),
});

const hotkeysSchema = z.object({
  pauseResume: z.string().min(1),
});

export const userSettingsSchema = z
  .object({
    cameraId: z.string().nullable(),
    resolution: resolutionSchema,
    fps: z.union([z.literal(30), z.literal(60)]),
    performanceProfile: z.enum(['high', 'balanced', 'battery', 'adaptive']),

    pinchEnterThreshold: z.number().min(0).max(1),
    pinchExitThreshold: z.number().min(0).max(1),
    scrollSensitivity: z.number().min(0.1).max(3),
    smoothing: smoothingSchema,

    audioEnabled: z.boolean(),
    audioVolume: z.number().min(0).max(1),

    outlineStyle: z.enum(['default', 'highContrast', 'minimal']),
    reducedMotion: z.boolean(),

    autostart: z.boolean(),
    hotkeys: hotkeysSchema,
    updateChecksEnabled: z.boolean(),

    tutorialSeen: z.boolean(),

    shareLandmarks: z.boolean(),
  })
  // Hysteresis invariant: exit must exceed enter, otherwise a closed pinch
  // could never re-open. Treat a violating value as invalid.
  .refine((s) => s.pinchExitThreshold > s.pinchEnterThreshold, {
    message: 'pinchExitThreshold must be greater than pinchEnterThreshold',
    path: ['pinchExitThreshold'],
  });

/** A partial-update schema for `settings:set` patches. */
export const userSettingsPatchSchema = userSettingsSchema
  .innerType()
  .partial();

/**
 * Parse arbitrary input and return a valid UserSettings.
 * Falls back to DEFAULT_USER_SETTINGS on any validation failure.
 *
 * Returns { settings, ok, error } so callers can log the validation
 * failure without crashing.
 */
export function parseOrDefault(input: unknown): {
  settings: UserSettings;
  ok: boolean;
  error?: z.ZodError;
} {
  const result = userSettingsSchema.safeParse(input);
  if (result.success) {
    return { settings: result.data, ok: true };
  }
  return { settings: DEFAULT_USER_SETTINGS, ok: false, error: result.error };
}

export type UserSettingsPatch = z.infer<typeof userSettingsPatchSchema>;
