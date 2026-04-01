import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!**/__tests__',
    '!**/__snapshots__',
    '!**/*.test.ts',
    '!**/test-helpers.ts',
  ],
  format: 'esm',
  target: 'node20',
  dts: true,
  outDir: 'dist',
  shims: true,
  unbundle: true,
  sourcemap: true,
  // Keep .js extension (tsdown 0.18+ defaults to .mjs)
  outExtensions() {
    return { js: '.js', dts: '.d.ts' };
  },
  globImport: true,
});
