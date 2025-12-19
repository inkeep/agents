import { defineConfig } from 'tsdown';
import rootConfig from '../../tsdown.config.ts';

export default defineConfig({
  ...rootConfig,
  format: ['esm'],
  entry: ['src/**/*.ts', '!**/__tests__', '!**/*.test.ts'],
  external: ['keytar'],
  unbundle: true,
});
