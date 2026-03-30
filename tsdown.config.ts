import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  target: 'es2022',
  treeshake: {
    preset: 'smallest',
  },
  format: ['esm', 'cjs'],
  // Disable hash in filenames for predictable DTS file paths
  hash: false,
  // Keep .js/.cjs extensions (tsdown 0.18+ defaults to .mjs/.cjs)
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
