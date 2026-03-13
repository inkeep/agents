import { defineConfig } from 'tsdown';
import rootConfig from '../../tsdown.config.ts';

export default defineConfig((options) => {
  const generateDts = !options.watch;

  return [
    {
      ...rootConfig,
      clean: !options.watch,
      dts: generateDts,
      format: 'esm',
      entry: [
        'src/**/*.ts',
        '!**/__tests__',
        '!**/*.test.ts',
        '!src/auth/auth.ts',
        '!src/auth/init.ts',
      ],
      external: ['@napi-rs/keyring', 'typescript'],
      unbundle: true,
    },
    {
      ...rootConfig,
      clean: false,
      dts: false,
      format: 'esm',
      entry: ['src/auth/auth.ts', 'src/auth/init.ts'],
      external: ['@napi-rs/keyring', 'typescript'],
      unbundle: true,
    },
  ];
});
