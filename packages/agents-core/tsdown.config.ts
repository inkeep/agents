import { defineConfig } from 'tsdown';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  name: packageJson.name,
  clean: true,
  dts: true,
  unbundle: true,
  target: 'es2022',
  format: 'esm',
  outExtensions: () => ({
    js: '.js',
  }),
  entry: ['src/**/*.ts', '!**/__tests__'],
  external: ['keytar', 'typescript'],
});
