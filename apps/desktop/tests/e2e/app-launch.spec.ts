/**
 * Smoke test (T109): Swoosh launches and shows its first window.
 *
 * This is the bare-minimum Electron e2e — it asserts the app starts,
 * a window opens, the title matches, and the renderer's React root
 * has mounted. Doesn't exercise the camera or MediaPipe (those need
 * fixture work — see playwright.config.ts header).
 *
 * Run prerequisites:
 *   pnpm build              # produces out/main/index.js
 *   pnpm --filter swoosh-desktop test:e2e
 *
 * The test runner sets SWOOSH_E2E so the main process can branch on
 * it later (e.g., to use a fake settings store, mute logging, etc.).
 */

import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const mainPath = resolve(__dirname, '..', '..', 'out', 'main', 'index.js');

// Use an ephemeral userData dir per test so a real install's settings
// don't leak into the run and vice versa.
function ephemeralUserData(): string {
  const dir = resolve(tmpdir(), `swoosh-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return dir;
}

test.beforeAll(() => {
  if (!existsSync(mainPath)) {
    throw new Error(
      `Expected built main at ${mainPath}. Run \`pnpm build\` before \`pnpm test:e2e\`.`,
    );
  }
});

test('Swoosh launches and opens its first window', async () => {
  const userData = ephemeralUserData();
  const app = await electron.launch({
    args: [mainPath, `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      SWOOSH_E2E: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
  });

  try {
    const win = await app.firstWindow();
    await expect(win).toHaveTitle(/Swoosh/);
    // Renderer entry mounts a <div id="root"> — ensure it's present.
    await win.waitForSelector('#root', { timeout: 15_000 });
  } finally {
    await app.close();
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

test('Swoosh advertises its version via Electron app.getVersion()', async () => {
  const userData = ephemeralUserData();
  const app = await electron.launch({
    args: [mainPath, `--user-data-dir=${userData}`],
    env: { ...process.env, SWOOSH_E2E: '1' },
  });
  try {
    const version: string = await app.evaluate(async ({ app: a }) => a.getVersion());
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  } finally {
    await app.close();
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});
