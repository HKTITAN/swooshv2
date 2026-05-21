import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const rendererRoot = resolve(__dirname, 'src/renderer');

export default defineConfig({
  main: {
    // `@swoosh/shared` lives outside this package in the pnpm workspace.
    // If we externalize it, electron-builder's asar packer refuses to
    // walk out of apps/desktop to find its package.json. Bundling it
    // into the main entry keeps everything self-contained.
    plugins: [externalizeDepsPlugin({ exclude: ['@swoosh/shared'] })],
    resolve: {
      alias: {
        '@swoosh/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@swoosh/shared'] })],
    resolve: {
      alias: {
        '@swoosh/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: rendererRoot,
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../../packages/shared/src'),
        '@ui': resolve(__dirname, 'src/renderer/shared-ui'),
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          overlay: resolve(rendererRoot, 'overlay/index.html'),
          settings: resolve(rendererRoot, 'settings/index.html'),
          tutorial: resolve(rendererRoot, 'tutorial/index.html'),
          'tray-popover': resolve(rendererRoot, 'tray-popover/index.html'),
        },
      },
    },
  },
});
