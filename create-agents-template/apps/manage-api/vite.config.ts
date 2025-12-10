import devServer from '@hono/vite-dev-server';
import { defineConfig } from 'vite';
import { startupLogPlugin } from '../shared/startup-log-plugin';

export default defineConfig({
  plugins: [
    devServer({
      entry: 'src/index.ts', // The Hono app entry point
    }),
    startupLogPlugin(),
  ],
  server: {
    port: 3002,
    host: '127.0.0.1', // Explicitly bind to IPv4 to avoid IPv6/IPv4 resolution issues
    allowedHosts: true,
    strictPort: true,
    cors: {
      origin: true,
      credentials: true,
    },
  },
});
