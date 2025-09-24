import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov', 'json-summary'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        'src/__tests__/setup.ts',
        'vitest.config.ts',
        'coverage/',
      ],
      // Target thresholds - already meeting goals
      thresholds: {
        global: {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        },
      },
    },
  },
});
