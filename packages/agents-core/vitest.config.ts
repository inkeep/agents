import { defineProject } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: packageJson.name,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60000, // 60 seconds for A2A client tests
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    exclude: ['node_modules', 'dist', '**/integration/**'],
    // Enable parallelism with in-memory databases - each worker gets isolated database
    fileParallelism: true,
    // Without this, vitest defaults to the forks pool: poolOptions.threads is
    // silently ignored and CI intermittently dies at teardown with tinypool
    // ERR_IPC_CHANNEL_CLOSED despite 0 failed tests (PRD-6963).
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 8, // Increased for better CPU utilization
        minThreads: 2,
      },
    },
    env: {
      ENVIRONMENT: 'test',
    },
  },
});
