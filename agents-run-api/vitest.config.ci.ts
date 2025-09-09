import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for A2A client tests
    exclude: ['node_modules', 'dist'],
    // Run tests sequentially in CI to avoid mock isolation issues
    fileParallelism: false,
    isolate: true, // Isolate test files for better mock cleanup
    poolOptions: {
      threads: {
        singleThread: true, // Run in a single thread for CI
      },
    },
    env: {
      ENVIRONMENT: 'test',
      DB_FILE_NAME: ':memory:',
      ANTHROPIC_API_KEY: 'test-key-for-tests',
    },
    coverage: {
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.test.js',
        'src/__tests__/',
        'coverage/',
      ],
    },
  },
});
