import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  target: 'es2022',
  treeshake: 'smallest',
  format: ['esm', 'cjs'],
});
