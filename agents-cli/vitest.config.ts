import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-cli',
    globals: true,
    environment: 'node',
    exclude: ['src/commands/pull-v3/__tests__/project-validator.test.ts', 'node_modules', 'dist'],
    setupFiles: ['./vitest.setup.ts'],
    env: {
      ENVIRONMENT: 'test',
      INKEEP_AGENTS_MANAGE_API_URL: 'http://localhost:3002',
      INKEEP_AGENTS_RUN_API_URL: 'http://localhost:3003',
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
  },
});
