import { defineConfig } from '@playwright/test';

/**
 * Playwright config for Swoosh's Electron e2e tests (T109).
 *
 * Tests live under `tests/e2e/`. Each test launches the packaged
 * Electron main bundle via `_electron.launch`, so the build must run
 * before tests: `pnpm build && pnpm test:e2e`.
 *
 * Camera-mocked flows (the actual tutorial-to-pinch-click happy path)
 * need a stubbed MediaStream + a way to inject synthetic landmarks;
 * that lives behind a feature flag in the renderer and is exercised
 * once the camera-mock fixture lands. Until then, this config covers
 * smoke-level launch + window-presence assertions.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // One worker so multiple Electron instances don't fight for the
  // single-instance lock.
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // Trace on first retry helps diagnose flaky Electron startup.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
