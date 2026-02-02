import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import pkgJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: pkgJson.name,
    environment: 'jsdom',
    setupFiles: './setup-files',
    globals: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
