import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const rendererRoot = resolve(__dirname, 'src/renderer');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
