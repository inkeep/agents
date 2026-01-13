import { defineConfig } from 'tsdown';

export default defineConfig((options) => ({
  entry: ['src/**/*.ts', '!**/__tests__', '!**/*.test.ts'],
  format: 'esm',
  target: 'node20',
  clean: !options.watch,
  dts: !options.watch,
  external: ['@inkeep/agents-core'],
  outDir: 'dist',
  shims: true,
  unbundle: true,
  // Keep .js extension (tsdown 0.18+ defaults to .mjs)
  outExtensions() {
    return { js: '.js', dts: '.d.ts' };
  },
}));
