import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    env: {
      ENVIRONMENT: 'test',
      NODE_ENV: 'test',
      DB_FILE_NAME: 'test.db',
      INKEEP_MANAGEMENT_API_URL: 'http://localhost:3001',
      INKEEP_EXECUTION_API_URL: 'http://localhost:3002',
    },
    testTimeout: 120000, // 120 second timeout for CLI tests
    hookTimeout: 30000, // 30 second timeout for setup/teardown hooks
    // Use thread pool to prevent worker timeout issues
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially to avoid race conditions
        isolate: true, // Isolate each test file
      },
    },
    // Increase maxConcurrency for CI environments
    maxConcurrency: 1,
    // Disable file parallelism to avoid timeouts
    fileParallelism: false,
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
