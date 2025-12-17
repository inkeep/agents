import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // Bundle zod INTO the package output to avoid version conflicts
  // with consumers that use Zod v4
  noExternal: ['zod'],
  // Keep .js/.cjs extensions (tsdown 0.18+ defaults to .mjs/.cjs)
  outExtensions({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
      dts: format === 'cjs' ? '.d.cts' : '.d.ts',
    };
  },
});
