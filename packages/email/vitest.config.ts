import { defineProject } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: packageJson.name,
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    exclude: ['node_modules', 'dist'],
    env: {
      ENVIRONMENT: 'test',
    },
  },
});
