import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov', 'json-summary'],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.d.ts',
        'vitest.config.ts',
        'coverage/',
        'src/app/**/*.tsx', // Exclude Next.js app router pages
        'next.config.js',
        'tailwind.config.js',
        'postcss.config.js',
      ],
      // Baseline thresholds - see COVERAGE_ROADMAP.md for improvement plan
      thresholds: {
        global: {
          branches: 20,
          functions: 20,
          lines: 20,
          statements: 20,
        },
      },
    },
    alias: [
      {
        // Fixes Error: Failed to resolve entry for package "monaco-editor". The package may have incorrect main/module/exports specified in its package.json.
        find: /^monaco-editor$/,
        replacement: path.resolve('node_modules/monaco-editor/esm/vs/editor/editor.api'),
      },
    ],
    setupFiles: './setup-files',
    globals: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
