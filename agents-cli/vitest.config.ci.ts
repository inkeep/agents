import { defineConfig } from 'vitest/config';
import { generateVitestCoverageConfig } from '../coverage.config';

/**
 * CI-specific configuration for agents-cli package
 * Optimized for CI environments with sequential execution and better isolation
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      ENVIRONMENT: 'test',
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
    // Use sophisticated coverage system with CLI-specific thresholds
    coverage: generateVitestCoverageConfig('cli'),
  },
});
