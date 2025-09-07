#!/usr/bin/env node
import { type BuildOptions, build } from 'esbuild';

const buildOptions: BuildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    // Keep node_modules external, but bundle workspace dependencies
    'commander',
    'chalk',
    'inquirer',
    'inquirer-autocomplete-prompt',
    'ora',
    'cli-table3',
    'dotenv',
    'drizzle-orm',
    '@libsql/client',
    'ai',
    'ts-morph',
    'recast',
    'ast-types',
    '@babel/parser',
    '@babel/types',
    '@ai-sdk/anthropic',
    '@ai-sdk/openai',
    'keytar',
  ],
  tsconfig: './tsconfig.json',
};

try {
  await build(buildOptions);
  console.log('✅ Build completed successfully!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
