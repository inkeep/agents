import { defineProject } from 'vitest/config';
import pkgJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: pkgJson.name,
    globals: true,
    environment: 'node',
    setupFiles: './vitest.setup.ts',
    env: {
      ENVIRONMENT: 'test',
      INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    },
    exclude: ['node_modules', 'dist', '**/integration/**'],
    testTimeout: 30000,
    hookTimeout: 15000,
    pool: 'threads',
    poolOptions: {
      threads: {
        isolate: true,
      },
    },
  },
});
