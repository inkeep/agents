import path from 'node:path';
import devServer from '@hono/vite-dev-server';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { workflow } from 'workflow/vite';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    workflow(),
    devServer({
      entry: 'src/index.ts',
    }),
  ],
  resolve: {
    alias: {
      '@inkeep/agents-manage-mcp': path.resolve(__dirname, '../packages/agents-manage-mcp'),
    },
  },
  server: {
    port: 3002,
    strictPort: true,
    cors: false,
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
