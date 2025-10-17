import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'create-agents',
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    env: {
      ENVIRONMENT: 'test',
    },
  },
});
