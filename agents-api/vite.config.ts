import devServer from '@hono/vite-dev-server';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { workflow } from 'workflow/vite';

/**
 * Sends a warmup request after the Vite dev server starts so that the Hono app
 * module is loaded eagerly. Without this, module-level side effects (like Slack
 * Socket Mode initialization) would not run until the first external request.
 */
function warmup(): Plugin {
  return {
    name: 'warmup',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (addr && typeof addr === 'object') {
          fetch(`http://localhost:${addr.port}/`).catch(() => {});
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    workflow(),
    devServer({
      entry: 'src/index.ts',
    }),
    warmup(),
  ],
  server: {
    port: 3002,
    strictPort: true,
    cors: false,
    allowedHosts: true,
  },
  optimizeDeps: {
    exclude: [
      '@napi-rs/keyring',
      'workflow',
      '@workflow/world-local',
      '@workflow/world-postgres',
      '@workflow/world-vercel',
      '@workflow/core',
    ],
  },
});
