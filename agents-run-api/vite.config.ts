import devServer from '@hono/vite-dev-server';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(), // This will automatically read tsconfig.json paths from dependencies
    devServer({
      entry: './index.ts', // The Hono app entry point
    }),
  ],
  server: {
    port: 3003,
  },
  optimizeDeps: {
    exclude: ['keytar'],
  },
});
