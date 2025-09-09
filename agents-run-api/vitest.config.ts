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
    isolate: false, // Faster execution by reusing worker context
    poolOptions: {
      threads: {
        maxThreads: 16, // Increase for GitHub Actions runners (have more cores)
        minThreads: 4,
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
