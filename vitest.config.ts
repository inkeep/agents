import { defineConfig } from 'vitest/config';
import { generateVitestCoverageConfig } from './coverage.config';

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

    // Root-level coverage configuration using the sophisticated coverage system
    // Individual projects cannot override coverage settings in workspace mode
    // The 'monorepo' package name uses minimum thresholds across all packages
    coverage: generateVitestCoverageConfig('monorepo'),
  },
});
