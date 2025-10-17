import { defineConfig } from 'vitest/config';
import { generateVitestCoverageConfig } from '../coverage.config';

/**
 * CI-specific configuration for agents-run-api package
 * Optimized for CI environments with sequential execution to avoid mock isolation issues
 */
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
    // Use sophisticated coverage system (agents-run-api uses baseline thresholds)
    coverage: generateVitestCoverageConfig('execution-api'),
  },
});
