/**
 * Bootstrap file for workflow configuration.
 * This file MUST be imported FIRST before any other imports in the application.
 * It sets up the environment variables needed for the workflow world.
 *
 * Supports two worlds:
 * - @workflow/world-postgres: For local development with durable workflows
 * - @workflow/world-vercel: For Vercel cloud deployments (production)
 *
 * Set WORKFLOW_TARGET_WORLD env var to choose which world to use.
 */

import { loadEnvironmentFiles } from '@inkeep/agents-core';

// Static imports to help Vercel's Node File Trace detect dependencies
// The workflow library dynamically imports based on WORKFLOW_TARGET_WORLD env var,
// but Vercel's NFT can't trace dynamic imports. These imports ensure modules are included.
import '@workflow/world-postgres';
import '@workflow/world-vercel';

// Also import and reference the packages to prevent tree-shaking
import * as worldPostgres from '@workflow/world-postgres';
import * as worldVercel from '@workflow/world-vercel';

// Force side-effect to retain imports (log to ensure they're loaded)
if (typeof worldPostgres === 'undefined' || typeof worldVercel === 'undefined') {
  throw new Error('Workflow worlds not loaded');
}
console.log('[workflow-bootstrap] Workflow worlds loaded:', {
  postgres: !!worldPostgres,
  vercel: !!worldVercel,
});

// Load .env files from current dir and root monorepo
loadEnvironmentFiles();

// Default to postgres world locally, but allow override via env var
// On Vercel, set WORKFLOW_TARGET_WORLD=@workflow/world-vercel
if (!process.env.WORKFLOW_TARGET_WORLD) {
  process.env.WORKFLOW_TARGET_WORLD = '@workflow/world-postgres';
}

// Only set postgres-specific vars if using postgres world
if (process.env.WORKFLOW_TARGET_WORLD === '@workflow/world-postgres') {
  // Use DATABASE_URL as fallback for WORKFLOW_POSTGRES_URL
  if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
    process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
  }

  // Set default job prefix if not set
  if (!process.env.WORKFLOW_POSTGRES_JOB_PREFIX) {
    process.env.WORKFLOW_POSTGRES_JOB_PREFIX = 'inkeep-agents-eval';
  }

  // Set PORT for workflow library - postgres world internally uses local world
  // which needs PORT to know where to send HTTP requests to /.well-known/workflow/v1/* endpoints
  if (!process.env.PORT) {
    process.env.PORT = '3005';
  }
}

console.log('[workflow-bootstrap] Configured workflow environment:', {
  WORKFLOW_TARGET_WORLD: process.env.WORKFLOW_TARGET_WORLD,
  WORKFLOW_POSTGRES_URL: process.env.WORKFLOW_POSTGRES_URL ? '[SET]' : '[NOT SET]',
  WORKFLOW_POSTGRES_JOB_PREFIX: process.env.WORKFLOW_POSTGRES_JOB_PREFIX,
  PORT: process.env.PORT,
});

