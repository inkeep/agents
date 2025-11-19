import devServer from '@hono/vite-dev-server';
import path from 'node:path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    devServer({
      entry: 'src/index.ts',
    }),
  ],
  server: {
    port: 3005,
    host: true,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@inkeep/agents-eval-mcp': path.resolve(__dirname, '../packages/agents-eval-mcp'),
    },
  },
});
