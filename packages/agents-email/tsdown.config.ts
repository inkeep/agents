import { defineConfig } from 'tsdown';
import rootConfig from '../../tsdown.config.ts';

export default defineConfig((options) => {
  return {
    ...rootConfig,
    clean: !options.watch,
    dts: !options.watch,
    format: 'esm',
    entry: ['src/**/*.ts', 'src/**/*.tsx', '!**/__tests__', '!**/*.test.ts'],
    unbundle: true,
  };
});
