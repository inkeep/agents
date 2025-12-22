import { defineConfig } from 'tsdown';

export default defineConfig({
  watch: process.env.MODE === 'watch',
  entry: {
    index: 'src/index.ts',
    config: 'src/config.ts',
    'schemas/types': 'src/schemas/types.ts',
    'schemas/commander-builder': 'src/schemas/commander-builder.ts',
    'schemas/commands/index': 'src/schemas/commands/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: process.env.MODE !== 'watch',
  // Minimal external list - just problematic packages
  // @nangohq/node uses axios which has CommonJS dependencies (form-data, combined-stream)
  // that use dynamic require('util') which can't be bundled into ESM
  external: [
    'keytar',
    'pino',
    'pino-pretty',
    'pg',
    'traverse',
    'destr',
    '@nangohq/node',
    '@nangohq/types',
    'zod', // Peer dependency used by schemas
  ],
  // Bundle workspace packages (use regex to match all subpath imports)
  noExternal: [/^@inkeep\/agents-core/],
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  shims: true,
  splitting: false,
  // Disable hash in filenames for predictable DTS file paths
  hash: false,
  // Keep .js extension (tsdown 0.18+ defaults to .mjs)
  outExtensions() {
    return { js: '.js', dts: '.d.ts' };
  },
});
