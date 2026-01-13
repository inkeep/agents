import { defineConfig } from 'tsdown';
import rootConfig from '../../tsdown.config.ts';

export default defineConfig((options) => ({
  ...rootConfig,
  clean: !options.watch,
  dts: !options.watch,
  entry: ['src/**/*.ts', '!**/__tests__', '!**/*.test.ts'],
  unbundle: true,
}));
