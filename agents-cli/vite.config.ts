import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    target: 'node20',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        // Keep all node_modules external
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
        '@inkeep/agents-core',
      ],
    },
    sourcemap: true,
  },
});
