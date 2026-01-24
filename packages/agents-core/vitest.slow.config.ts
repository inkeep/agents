import { defineProject } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: `${packageJson.name}:slow`,
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60000, // 60 seconds for database operations
    hookTimeout: 60000,
    include: ['**/*.slow.test.ts'],
    exclude: ['node_modules', 'dist'],
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
