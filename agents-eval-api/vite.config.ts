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
if (!process.env.WORKFLOW_TARGET_WORLD) {
  process.env.WORKFLOW_TARGET_WORLD = '@workflow/world-postgres';
}
// Use DATABASE_URL as fallback for WORKFLOW_POSTGRES_URL
if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
}
if (!process.env.WORKFLOW_POSTGRES_JOB_PREFIX) {
  process.env.WORKFLOW_POSTGRES_JOB_PREFIX = 'inkeep-agents-eval';
}

import devServer from '@hono/vite-dev-server';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { workflow } from 'workflow/vite';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const pkg = require('./package.json');

export default defineConfig(({ command }) => ({
  plugins: [
    tsconfigPaths(),
    workflow(),
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
      '@workflow/world-postgres',
      '@workflow/core',
      '@workflow/world-local',
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
    noExternal: [
      '@inkeep/agents-core',
      /^@inkeep\/.*/,
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
        // Externalize all dependencies - Vercel will install them from package.json
        // This avoids bundling issues with dynamic imports in workflow packages
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.optionalDependencies || {}),
      ],
    },
  },
}));
