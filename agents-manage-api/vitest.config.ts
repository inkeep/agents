import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-manage-api',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for database operations
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    exclude: ['node_modules', 'dist'],
    // Enable parallelism with in-memory databases - each worker gets isolated database
    fileParallelism: true,
    isolate: true, // Ensure test isolation to prevent state leakage
    poolOptions: {
      threads: {
        maxThreads: 10, // Increase for GitHub Actions runners (have more cores)
        minThreads: 4,
      },
    },
    env: {
      ENVIRONMENT: 'test',
      ANTHROPIC_API_KEY: 'test-api-key',
      OPENAI_API_KEY: 'test-openai-key',
      LOG_LEVEL: 'error',
    },
  },
});
