/**
 * Vite configuration for agents-eval-api.
 *
 * Environment variables must be set BEFORE imports since vite config runs before TS compilation.
 */
import { config } from 'dotenv';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// Load .env files
const currentEnv = resolve(process.cwd(), '.env');
const rootEnv = resolve(dirname(process.cwd()), '.env');

if (existsSync(currentEnv)) {
  config({ path: currentEnv });
}
if (existsSync(rootEnv)) {
  config({ path: rootEnv, override: false });
}

// Set default PORT for workflow library
if (!process.env.PORT) {
  process.env.PORT = '3005';
}

// Set postgres-specific vars if using postgres world
if (process.env.WORKFLOW_TARGET_WORLD === 'postgres') {
  if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
  }
  if (!process.env.WORKFLOW_POSTGRES_JOB_PREFIX) {
    process.env.WORKFLOW_POSTGRES_JOB_PREFIX = 'inkeep-agents-eval';
  }
}

import devServer from '@hono/vite-dev-server';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { workflow } from 'workflow/vite';

const require = createRequire(import.meta.url);
const __dirname = dirname(new URL(import.meta.url).pathname);
const pkg = require('./package.json');

function copyWellKnown(): Plugin {
  return {
    name: 'copy-well-known',
    closeBundle() {
      const src = resolve(__dirname, '.well-known');
      const dest = resolve(__dirname, 'dist/.well-known');
      if (existsSync(src)) {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(src, dest, { recursive: true });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    tsconfigPaths(),
    workflow(),
    copyWellKnown(),
    ...(command === 'serve' ? [devServer({ entry: 'src/index.ts' })] : []),
  ],
  server: {
    port: 3005,
    host: true,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: [
      'keytar',
      'workflow',
      '@workflow/world-local',
      '@workflow/world-postgres',
      '@workflow/world-vercel',
      '@workflow/core',
      'find-up',
      'unicorn-magic',
      'locate-path',
      'path-exists',
      'p-locate',
      'yocto-queue',
      '@inkeep/agents-core',
    ],
  },
  ssr: {
    external: [
      'keytar',
      'find-up',
      'unicorn-magic',
      'locate-path',
      'path-exists',
      'p-locate',
      'yocto-queue',
      /\.well-known\/workflow\/v1\/.*/,
    ],
    noExternal: [
      '@inkeep/agents-core',
      /^@inkeep\/.*/,
      'workflow',
      '@workflow/world-local',
      '@workflow/world-postgres',
      '@workflow/world-vercel',
      /^@workflow\/.*/,
    ],
    resolve: {
      conditions: ['node', 'import', 'module', 'require'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'node22',
    ssr: true,
    outDir: 'dist',
    rollupOptions: {
      input: 'src/index.ts',
      output: {
        entryFileNames: 'index.js',
        format: 'esm',
      },
      external: [
        /^node:/,
        'keytar',
        ...Object.keys(pkg.dependencies || {}).filter(
          (dep) => !dep.startsWith('workflow') && !dep.startsWith('@workflow/')
        ),
        ...Object.keys(pkg.optionalDependencies || {}),
      ],
    },
  },
}));
