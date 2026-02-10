import { defineConfig } from 'vitest/config';

/**
 * Configuration for e2e / integration tests that should NOT run as part of
 * the normal `pnpm test` suite. Run them manually:
 *
 *   npx vitest --run --config vitest.config.e2e.ts
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/e2e/**/*.test.ts'],
    testTimeout: 360_000, // 6 min per test
    hookTimeout: 300_000, // 5 min for setup/teardown
    reporters: ['verbose'],
    fileParallelism: false,
  },
});
