import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-cli-integration',
    globals: true,
    environment: 'node',
    setupFiles: './vitest.setup.ts',
    include: ['src/__tests__/integration/**/*.test.ts'],
    env: {
      ENVIRONMENT: 'test',
      INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    },
    testTimeout: 120000,
    hookTimeout: 30000,
    fileParallelism: false,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: true,
      },
    },
    maxConcurrency: 1,
    retry: 2,
  },
});
