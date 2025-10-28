import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'create-agents',
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 1 minute for unit tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    env: {
      ENVIRONMENT: 'test',
    },

    // E2E tests need sequential execution to avoid filesystem/process conflicts
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run tests one at a time
        isolate: true, // Isolate test environments
      },
    },
    fileParallelism: false, // Don't run test files in parallel
    maxConcurrency: 1, // Only one test at a time
  },
});
