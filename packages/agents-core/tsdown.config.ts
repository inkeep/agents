import { defineConfig } from 'tsdown';
import rootConfig from '../../tsdown.config.ts';

export default defineConfig((options) => {
  return {
    ...rootConfig,
    clean: !options.watch,
    dts: !options.watch,
    format: 'esm',
    entry: ['src/**/*.ts', '!**/__tests__', '!**/*.test.ts'],
    external: ['@napi-rs/keyring', 'typescript'],
    unbundle: true,
  };
});
