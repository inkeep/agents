import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-core',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for A2A client tests
    exclude: ['node_modules', 'dist'],
    // Enable parallelism with in-memory databases - each worker gets isolated database
    fileParallelism: true,
    poolOptions: {
      threads: {
        maxThreads: 8, // Increased for better CPU utilization
        minThreads: 2,
      },
    },
    env: {
      ENVIRONMENT: 'test',
      DB_FILE_NAME: ':memory:',
    },
  },
});
