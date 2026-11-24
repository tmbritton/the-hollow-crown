import { defineConfig } from 'vite';
import { realpathSync } from 'node:fs';

export default defineConfig({
  cacheDir: 'test-results/vite-cache',
  plugins: [
    {
      name: 'encounter-owned-root',
      apply: 'serve',
      configureServer(server) {
        const nonce = process.env.ENCOUNTER_VITE_NONCE;
        if (!nonce) return;
        server.middlewares.use('/__encounter-root', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              nonce,
              cwd: realpathSync(process.cwd()),
              root: realpathSync(server.config.root),
            }),
          );
        });
      },
    },
  ],
  // Prebundle the optional inspector up front so opening it cannot reload a run.
  optimizeDeps: { include: ['@babylonjs/inspector'] },
});
