/**
 * Ambient declaration so renderer code is fully typed against the
 * preload-exposed `window.swoosh` surface. Keep this file in sync with
 * apps/desktop/src/preload/index.ts via the `SwooshApi` type export.
 */

import type { SwooshApi } from '../preload/index';

declare global {
  interface Window {
    swoosh: SwooshApi;
  }
}

export {};
