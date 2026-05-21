import { defineConfig } from 'vitest/config';

/**
 * Vitest config for apps/desktop unit tests.
 *
 * The Playwright e2e suite under tests/e2e/ is excluded — those
 * files use Playwright's `test` API, which collides with vitest's,
 * and they require a built Electron main bundle to run. Use
 * `pnpm test:e2e` to drive them.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx,mts,cts}', 'tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'out/**', 'dist/**'],
  },
});
