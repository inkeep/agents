import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-core-llm',
    globals: true,
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 60000,
    include: ['src/**/*.llm.test.ts'],
    exclude: ['node_modules', 'dist'],
    fileParallelism: false,
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1,
      },
    },
  },
});
