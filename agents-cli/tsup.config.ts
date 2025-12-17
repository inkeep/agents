import { defineConfig } from 'tsup';

export default defineConfig({
  watch: process.env.MODE === 'watch',
  entry: {
    index: 'src/index.ts',
    config: 'src/config.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: process.env.MODE !== 'watch',
  bundle: true,
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
  ],
  // Bundle workspace packages
  noExternal: ['@inkeep/agents-core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  shims: true,
  splitting: false,
});
