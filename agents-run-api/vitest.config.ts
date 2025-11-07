import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-run-api',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for A2A client tests
    exclude: ['node_modules', 'dist'],
    // Enable parallelism with in-memory databases - each worker gets isolated database
    fileParallelism: true,
    isolate: true, // Ensure test isolation to prevent state leakage
    poolOptions: {
      threads: {
        maxThreads: 16, // Increase for GitHub Actions runners (have more cores)
        minThreads: 4,
      },
    },
    env: {
      ENVIRONMENT: 'test',
      ANTHROPIC_API_KEY: 'test-key-for-tests',
    },
  },
});
