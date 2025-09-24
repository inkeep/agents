import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      ENVIRONMENT: 'test',
      DB_FILE_NAME: ':memory:',
    },
    testTimeout: 180000, // 3 minute timeout for CI tests
    hookTimeout: 60000, // 1 minute timeout for setup/teardown hooks
    // Use forks pool for better isolation in CI
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially
        isolate: true, // Isolate each test file
        // Prevent memory issues in CI
        vmThreads: false,
      },
    },
    // Disable parallelism for stability
    maxConcurrency: 1,
    fileParallelism: false,
    // Increase reporter verbosity for better debugging
    reporters: ['verbose'],
    // Retry flaky tests
    retry: 2,
    // Don't fail on first test failure
    bail: 0,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov', 'json-summary'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
        'vitest.config.ci.ts',
        'coverage/',
      ],
      // Good coverage - maintaining high standards
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
  },
});
