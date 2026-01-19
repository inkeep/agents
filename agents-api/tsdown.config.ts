import { defineConfig } from 'tsdown';
import rootConfig from '../tsdown.config.ts';

export default defineConfig({
  ...rootConfig,
  entry: ['src/**/*.ts', '!**/__tests__', '!**/*.test.ts'],
  unbundle: true,
  format: 'esm',
  loader: {
    '.xml': 'text',
    '.md': 'text',
  },
});
