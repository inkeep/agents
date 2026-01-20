import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-core-dolt-integration',
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for database operations
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    include: ['src/__tests__/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Disable parallelism for integration tests to avoid conflicts with shared Doltgres instance
    fileParallelism: false,
    isolate: true,
    poolOptions: {
      threads: {
        maxThreads: 1, // Run integration tests serially
        minThreads: 1,
      },
    },
    env: {
      // DO NOT set ENVIRONMENT: 'test' here - we need to use actual DATABASE_URL for Doltgres
      LOG_LEVEL: 'error',
    },
  },
});
