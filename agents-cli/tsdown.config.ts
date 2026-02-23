import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.ts', '!**/__tests__', '!**/__snapshots__', '!**/*.test.ts'],
  format: 'esm',
  target: 'node20',
  dts: true,
  external: ['@inkeep/agents-core', '@napi-rs/keyring'],
  outDir: 'dist',
  shims: true,
  unbundle: true,
  // Keep .js extension (tsdown 0.18+ defaults to .mjs)
  outExtensions() {
    return { js: '.js', dts: '.d.ts' };
  },
});
