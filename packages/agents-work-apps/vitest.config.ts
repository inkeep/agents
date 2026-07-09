import { defineProject } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: packageJson.name,
    setupFiles: './src/__tests__/setup.ts',
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for database operations
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    exclude: ['node_modules', 'dist'],
    // Enable parallelism with in-memory databases - each worker gets isolated database
    fileParallelism: true,
    isolate: true, // Ensure test isolation to prevent state leakage
    // Without this, vitest defaults to the forks pool: poolOptions.threads is
    // silently ignored and CI intermittently dies at teardown with tinypool
    // ERR_IPC_CHANNEL_CLOSED despite 0 failed tests (PRD-6963).
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 10, // Increase for GitHub Actions runners (have more cores)
        minThreads: 4,
      },
    },
    env: {
      ENVIRONMENT: 'test',
      LOG_LEVEL: 'error',
    },
  },
});
