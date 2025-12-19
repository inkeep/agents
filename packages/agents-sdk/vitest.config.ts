import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agents-sdk',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      ENVIRONMENT: 'test',
    },
    testTimeout: 60000,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
