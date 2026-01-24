import { defineProject } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: `${packageJson.name}:fast`,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 5000, // 5 seconds for fast tests
    hookTimeout: 5000,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      'node_modules',
      'dist',
      '**/*.slow.test.ts',
      '**/*.integration.test.ts',
      '**/integration/**',
    ],
    fileParallelism: true,
    poolOptions: {
      threads: {
        maxThreads: 8,
        minThreads: 2,
      },
    },
    env: {
      ENVIRONMENT: 'test',
    },
  },
});
