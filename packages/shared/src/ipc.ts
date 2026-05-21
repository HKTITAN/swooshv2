/**
 * Swoosh IPC contract — single source of truth for renderer ⇄ main channels.
 * Mirror of specs/001-swoosh-mvp/contracts/ipc.ts.
 *
 * Every IPC channel in the app must be referenced via the constants
 * exported here. No string literals scattered through main/renderer code.
 */

import type { Gesture, HandLandmarks } from './types';

/** Channels that flow from any renderer to main. */
export interface RendererToMain {
  /** Overlay emits classified gestures at frame cadence. */
  'gesture:emit': (payload: GestureEmitPayload) => void;
  /** Pause / resume tracking (also exposed via tray, hotkey, OS lock). */
  'tracking:pause': () => void;
  'tracking:resume': () => void;
  /** Request the current paused/active state. */
  'tracking:getState': () => Promise<TrackingState>;
  /** Settings store. */
  'settings:get': () => Promise<UserSettings>;
  'settings:set': (patch: Partial<UserSettings>) => Promise<UserSettings>;
  /** Cameras. */
  'camera:list': () => Promise<CameraSource[]>;
  /** Tutorial. */
  'tutorial:complete': () => Promise<void>;
  'tutorial:replay': () => Promise<void>;
  /** Open the settings window (from popover, hotkey, etc.). */
  'window:openSettings': () => void;
  /** Quit. */
  'app:quit': () => void;
  /** Updates. */
  'update:check': () => Promise<UpdateCheckResult>;
  'update:install': () => Promise<void>;
  /** Benchmark. */
  'benchmark:run': () => Promise<BenchmarkResult>;
}

/** Channels that flow from main to renderers (broadcast or targeted). */
export interface MainToRenderer {
  'tracking:state': (state: TrackingState) => void;
  'settings:changed': (settings: UserSettings) => void;
  'tutorial:show': () => void;
  'overlay:resize': (bounds: ScreenBounds) => void;
  'update:available': (info: { version: string; notes?: string }) => void;
  'update:progress': (percent: number) => void;
}

/** All renderer→main channel names as a string-literal union. */
export type RendererToMainChannel = keyof RendererToMain;
/** All main→renderer channel names as a string-literal union. */
export type MainToRendererChannel = keyof MainToRenderer;

/** Channel name constants — use these everywhere instead of string literals. */
export const IPC = {
  gestureEmit: 'gesture:emit',
  trackingPause: 'tracking:pause',
  trackingResume: 'tracking:resume',
  trackingGetState: 'tracking:getState',
  trackingState: 'tracking:state',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',
  cameraList: 'camera:list',
  tutorialComplete: 'tutorial:complete',
  tutorialReplay: 'tutorial:replay',
  tutorialShow: 'tutorial:show',
  windowOpenSettings: 'window:openSettings',
  appQuit: 'app:quit',
  overlayResize: 'overlay:resize',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateAvailable: 'update:available',
  updateProgress: 'update:progress',
  benchmarkRun: 'benchmark:run',
} as const;

// --- Payloads ----------------------------------------------------------------

export interface GestureEmitPayload {
  gesture: Gesture;
  /** Pointer position in OS logical pixels on the active monitor. */
  cursor: { x: number; y: number };
  /** ts as performance.now() at frame capture (renderer side). */
  ts: number;
  /** Optional landmarks for the active hand(s); included only when settings.shareLandmarks is true (dev mode). */
  landmarks?: HandLandmarks[];
}

export type TrackingState =
  | { kind: 'active'; fps: number }
  | { kind: 'paused'; reason: PauseReason }
  | { kind: 'noCamera' }
  | { kind: 'permissionDenied' }
  | { kind: 'cameraInUse'; byApp?: string };

export type PauseReason =
  | 'user'
  | 'trayToggle'
  | 'hotkey'
  | 'osLock'
  | 'osSleep'
  | 'displayOff';

export interface CameraSource {
  id: string;
  label: string;
  defaultResolution?: { width: number; height: number };
  defaultFps?: number;
  inUse?: boolean;
}

export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface UpdateCheckResult {
  current: string;
  latest?: string;
  hasUpdate: boolean;
  releaseNotesUrl?: string;
}

export interface BenchmarkResult {
  fps: number;
  resolution: { width: number; height: number };
  durationMs: number;
  sampleCount: number;
  selectedProfile: 'high' | 'balanced' | 'battery';
}

// --- UserSettings ------------------------------------------------------------

export interface UserSettings {
  // Camera
  cameraId: string | null;
  resolution: { width: number; height: number };
  fps: 30 | 60;
  performanceProfile: 'high' | 'balanced' | 'battery' | 'adaptive';

  // Gestures
  pinchEnterThreshold: number; // 0..1 normalized inter-fingertip distance
  pinchExitThreshold: number; // > pinchEnterThreshold
  scrollSensitivity: number; // 0.1 .. 3.0
  smoothing: {
    minCutoff: number; // 1-Euro filter, default 1.0
    beta: number; // default 0.05
  };

  // Audio
  audioEnabled: boolean;
  audioVolume: number; // 0..1

  // Appearance
  outlineStyle: 'default' | 'highContrast' | 'minimal';
  reducedMotion: boolean;

  // System
  autostart: boolean;
  hotkeys: { pauseResume: string };
  updateChecksEnabled: boolean;

  // First-run / tutorial
  tutorialSeen: boolean;

  // Dev / experimental
  shareLandmarks: boolean; // Forwards landmark data over IPC for debugging only
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  cameraId: null,
  resolution: { width: 1280, height: 720 },
  fps: 30,
  performanceProfile: 'adaptive',
  pinchEnterThreshold: 0.06,
  pinchExitThreshold: 0.085,
  scrollSensitivity: 1.0,
  smoothing: { minCutoff: 1.0, beta: 0.05 },
  audioEnabled: true,
  audioVolume: 0.5,
  outlineStyle: 'default',
  reducedMotion: false,
  autostart: false,
  hotkeys: { pauseResume: 'Ctrl+Alt+Space' },
  updateChecksEnabled: true,
  tutorialSeen: false,
  shareLandmarks: false,
};
