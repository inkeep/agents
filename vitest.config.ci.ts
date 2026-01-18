import { defineConfig } from 'vitest/config';
import { generateVitestCoverageConfig } from './coverage.config';

/**
 * CI-specific Vitest configuration for the workspace
 *
 * This config is optimized for CI environments with:
 * - Sequential test execution for stability
 * - Increased timeouts for slower CI environments
 * - Better isolation to prevent flaky tests
 * - Test retries for transient failures
 * - Verbose reporting for debugging
 */
export default defineConfig({
  test: {
    // Define all test projects in the monorepo
    projects: [
      './agents-cli',
      './agents-manage-api',
      './agents-manage-ui',
      './agents-run-api',
      './packages/agents-core',
      './packages/agents-sdk',
    ],

    // CI-specific test settings for stability
    globals: true,
    environment: 'node',

    // Increased timeouts for CI environments
    testTimeout: 180000, // 3 minutes
    hookTimeout: 60000, // 1 minute for setup/teardown

    // Use forks pool for better isolation in CI
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially for stability
        isolate: true, // Isolate each test file
        vmThreads: false, // Prevent memory issues in CI
      },
    },

    // Disable parallelism for stability
    maxConcurrency: 1,
    fileParallelism: false,

    // Increase reporter verbosity for better debugging
    reporters: ['verbose'],

    // Retry flaky tests in CI
    retry: 2,

    // Don't fail on first test failure
    bail: 0,

    // Environment variables for CI
    env: {
      ENVIRONMENT: 'test',
    },

    // Root-level coverage configuration using the sophisticated coverage system
    // Individual projects cannot override coverage settings in workspace mode
    // The 'monorepo' package name uses minimum thresholds across all packages
    coverage: generateVitestCoverageConfig('monorepo'),
  },
});
