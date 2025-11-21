import devServer from '@hono/vite-dev-server';
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
    port: 3002,
    strictPort: true,
    cors: false,
  },
  optimizeDeps: {
    exclude: ['keytar'],
  },
});
