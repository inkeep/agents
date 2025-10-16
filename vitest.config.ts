import { defineConfig } from 'vitest/config';

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

    // Root-level coverage configuration (required by Vitest)
    // Individual projects cannot override coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov', 'json-summary'],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/vitest.config.ts',
        'coverage/',
        '**/setup.ts',
        '**/setup-files/**',
        'next.config.js',
        'tailwind.config.js',
        'postcss.config.js',
      ],
    },
  },
});
