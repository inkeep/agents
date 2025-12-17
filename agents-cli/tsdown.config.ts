import { defineConfig } from 'tsdown';

export default defineConfig({
  watch: process.env.MODE === 'watch',
  entry: ['src/**/*.ts', '!**/__tests__', '!**/*.test.ts'],
  format: ['esm'],
  target: 'node20',
  dts: process.env.MODE !== 'watch',
  external: ['@inkeep/agents-core'],
  outDir: 'dist',
  shims: true,
  unbundle: true,
  // Keep .js extension (tsdown 0.18+ defaults to .mjs)
  outExtensions() {
    return { js: '.js', dts: '.d.ts' };
  },
});
