import { defineConfig } from 'vitest/config';
import { generateVitestCoverageConfig } from '../coverage.config';

/**
 * CI-specific configuration for agents-cli package.
 * Uses forks pool with parallel execution on ubuntu-32gb (8 cores).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      ENVIRONMENT: 'test',
    },
    testTimeout: 60000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
    exclude: ['node_modules', 'dist', '**/integration/**'],
    reporters: ['verbose'],
    retry: 1,
    bail: 0,
    coverage: generateVitestCoverageConfig('cli'),
  },
});
