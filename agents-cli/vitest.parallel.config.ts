import { defineProject } from 'vitest/config';

/**
 * Parallel test configuration for agents-cli package.
 *
 * This config runs only tests that are safe for parallel execution:
 * - Generator tests (pure code generation functions)
 * - Pure utility tests (no file system or global mocks)
 *
 * Tests excluded from parallel execution (run with default config):
 * - Command tests that mock globals (process.exit, console, fetch)
 * - Tests with file system operations
 * - CLI integration tests that spawn child processes
 *
 * See TEST_PARALLELIZATION_NOTES.md for full analysis.
 */
export default defineProject({
  test: {
    name: 'agents-cli:parallel',
    globals: true,
    environment: 'node',
    include: [
      // Generator tests - pure code generation functions
      'src/commands/pull-v3/components/__tests__/*.test.ts',
      // Pure utility tests
      'src/utils/__tests__/package-manager.test.ts',
      'src/utils/__tests__/url.test.ts',
      'src/__tests__/utils/json-comparator.test.ts',
      'src/__tests__/utils/templates.test.ts',
      'src/__tests__/utils/ci-environment.test.ts',
      // Component parser (pure transformation)
      'src/commands/pull-v3/component-parser.test.ts',
    ],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./vitest.setup.ts'],
    env: {
      ENVIRONMENT: 'test',
      INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    },
    testTimeout: 30000, // 30 second timeout for fast tests
    hookTimeout: 10000, // 10 second timeout for setup/teardown hooks
    // Enable parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false, // Allow parallel execution
        isolate: true, // Isolate each test file for safety
      },
    },
    maxConcurrency: 8, // Allow up to 8 concurrent tests
    fileParallelism: true, // Enable parallel file execution
  },
});
