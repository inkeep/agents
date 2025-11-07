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
  external: ['keytar', 'pino', 'pino-pretty', 'pg'],
  // Bundle workspace packages
  noExternal: ['@inkeep/agents-core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  shims: true,
  splitting: false,
});
