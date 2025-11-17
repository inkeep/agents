import devServer from '@hono/vite-dev-server';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

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
      '@': resolve(__dirname, './src'),
    },
  },
});
