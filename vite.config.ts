import { defineConfig } from 'vite';

export default defineConfig({
  // Prebundle the optional inspector up front so opening it cannot reload a run.
  optimizeDeps: { include: ['@babylonjs/inspector'] },
});
