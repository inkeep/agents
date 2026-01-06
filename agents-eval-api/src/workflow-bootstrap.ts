/**
 * Bootstrap file for workflow configuration.
 * This file MUST be imported FIRST before any other imports in the application.
 * It sets up the environment variables needed for the workflow world.
 *
 * Set WORKFLOW_TARGET_WORLD env var to one of:
 * - 'local': For quickstart and local development (no external deps)
 * - 'vercel': For Vercel cloud deployments (production)
 * - '@workflow/world-postgres': For self-hosted deployments with durable workflows
 */

import { loadEnvironmentFiles } from '@inkeep/agents-core';

// Static imports to help Vercel's Node File Trace detect dependencies
// The workflow library dynamically imports based on WORKFLOW_TARGET_WORLD env var,
// but Vercel's NFT can't trace dynamic imports. These imports ensure modules are included.
import '@workflow/world-local';
import '@workflow/world-postgres';
import '@workflow/world-vercel';

// Also import and reference the packages to prevent tree-shaking
import * as worldLocal from '@workflow/world-local';
import * as worldPostgres from '@workflow/world-postgres';
import * as worldVercel from '@workflow/world-vercel';

if (typeof worldLocal === 'undefined' || typeof worldPostgres === 'undefined' || typeof worldVercel === 'undefined') {
  throw new Error('Workflow worlds not loaded');
}
console.log('[workflow-bootstrap] Workflow worlds loaded:', {
  local: !!worldLocal,
  postgres: !!worldPostgres,
  vercel: !!worldVercel,
});

// Load .env files from current dir and root monorepo
loadEnvironmentFiles();

// Set PORT for workflow library - local world needs PORT to know where to send HTTP requests
if (!process.env.PORT) {
  process.env.PORT = '3005';
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
}
