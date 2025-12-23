// Set workflow environment variables BEFORE any imports
// Note: Can't import from @inkeep/agents-core here as vite config runs before TS compilation
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

// Load .env from current dir first, then root monorepo
const currentEnv = resolve(process.cwd(), '.env');
const rootEnv = resolve(dirname(process.cwd()), '.env');

if (existsSync(currentEnv)) {
  config({ path: currentEnv });
}
if (existsSync(rootEnv)) {
  config({ path: rootEnv, override: false });
}

// Set default workflow target if not already set
// Default to local world for quickstart/local dev (no external deps needed)
// if (!process.env.WORKFLOW_TARGET_WORLD) {
//   process.env.WORKFLOW_TARGET_WORLD = 'local';
// }
// Set PORT for workflow library - it needs this to know where to send HTTP requests
// The local world calls /.well-known/workflow/v1/* endpoints
if (!process.env.PORT) {
  process.env.PORT = '3005';
}
// Only set postgres-specific vars if using postgres world
if (process.env.WORKFLOW_TARGET_WORLD === '@workflow/world-postgres' || process.env.WORKFLOW_TARGET_WORLD === 'postgres') {
  // Use DATABASE_URL as fallback for WORKFLOW_POSTGRES_URL
  if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
  }
  if (!process.env.WORKFLOW_POSTGRES_JOB_PREFIX) {
    process.env.WORKFLOW_POSTGRES_JOB_PREFIX = 'inkeep-agents-eval';
  }
}

import devServer from '@hono/vite-dev-server';
import { createRequire } from 'node:module';
import { cpSync, existsSync as fsExistsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { workflow } from 'workflow/vite';

// Custom plugin to copy .well-known folder to dist after build
function copyWellKnown(): Plugin {
  return {
    name: 'copy-well-known',
    closeBundle() {
      const src = path.resolve(__dirname, '.well-known');
      const dest = path.resolve(__dirname, 'dist/.well-known');
      if (fsExistsSync(src)) {
        mkdirSync(path.dirname(dest), { recursive: true });
        cpSync(src, dest, { recursive: true });
        console.log('[vite] Copied .well-known to dist/.well-known');
      }
    },
  };
}

const require = createRequire(import.meta.url);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const pkg = require('./package.json');

export default defineConfig(({ command }) => ({
  plugins: [
    tsconfigPaths(),
    workflow(),
    // Copy .well-known workflow handlers to dist after build
    copyWellKnown(),
    // Only include dev server for serve command
    ...(command === 'serve' ? [devServer({ entry: 'src/index.ts' })] : []),
  ],
  server: {
    port: 3005,
    host: true,
    strictPort: true,
  },
  // Exclude problematic modules from dependency optimization
  // The find-up/unicorn-magic chain has ESM export issues with esbuild
  optimizeDeps: {
    exclude: [
      'keytar',
      'workflow',
      '@workflow/world-local',
      '@workflow/world-postgres',
      '@workflow/world-vercel',
      '@workflow/core',
      // find-up chain has ESM interop issues
      'find-up',
      'unicorn-magic',
      'locate-path',
      'path-exists',
      'p-locate',
      'yocto-queue',
      // Don't optimize workspace packages
      '@inkeep/agents-core',
    ],
  },
  // SSR configuration - let Vite transform workspace packages
  ssr: {
    external: [
      'keytar',
      // Keep find-up chain external to avoid ESM issues
      'find-up',
      'unicorn-magic', 
      'locate-path',
      'path-exists',
      'p-locate',
      'yocto-queue',
      // Externalize generated workflow bundles - loaded via require()/import()
      /\.well-known\/workflow\/v1\/.*/,
    ],
    // Let Vite process workspace packages (TypeScript sources)
    // And bundle workflow packages (they use dynamic imports that NFT can't trace)
    noExternal: [
      '@inkeep/agents-core',
      /^@inkeep\/.*/,
      'workflow',
      '@workflow/world-local',
      '@workflow/world-postgres',
      '@workflow/world-vercel',
      /^@workflow\/.*/,
    ],
    // Resolve conditions for proper CJS/ESM handling
    resolve: {
      conditions: ['node', 'import', 'module', 'require'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
        // Externalize all dependencies EXCEPT workflow packages
        // Workflow packages use dynamic imports that Vercel NFT can't trace,
        // so we must bundle them into dist/index.js
        ...Object.keys(pkg.dependencies || {}).filter(
          (dep) => !dep.startsWith('workflow') && !dep.startsWith('@workflow/')
        ),
        ...Object.keys(pkg.optionalDependencies || {}),
      ],
    },
  },
}));
