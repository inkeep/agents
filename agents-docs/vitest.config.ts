import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import pkgJson from './package.json' with { type: 'json' };

export default defineConfig({
  test: {
    name: pkgJson.name,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
});
