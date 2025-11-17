import devServer from '@hono/vite-dev-server';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [
    tsconfigPaths(), // This will automatically read tsconfig.json paths from dependencies
    devServer({
      entry: 'src/index.ts', // The Hono app entry point
    }),
  ],
  resolve: {
    alias: {
      '@inkeep/agents-mcp': path.resolve(__dirname, '../../packages/agents-mcp/inkeep-sdk-mcp-typescript'),
    },
  },
  server: {
    port: 3002,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['keytar'],
  },
});
