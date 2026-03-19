import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'zendesk-mcp',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    env: {
      ENVIRONMENT: 'test',
    },
  },
});
