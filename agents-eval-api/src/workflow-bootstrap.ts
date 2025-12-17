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

// Static imports to help bundlers trace dependencies
// The workflow library dynamically imports based on WORKFLOW_TARGET_WORLD env var,
// but bundlers can't trace dynamic imports. These imports ensure modules are included.
import * as _worldPostgres from '@workflow/world-postgres';
import * as _worldVercel from '@workflow/world-vercel';

// Force modules to be retained in the bundle (prevents tree-shaking)
// @ts-ignore - intentionally checking for truthy modules
if (!_worldPostgres && !_worldVercel) throw new Error('No workflow world loaded');

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
}

console.log('[workflow-bootstrap] Configured workflow environment:', {
  WORKFLOW_TARGET_WORLD: process.env.WORKFLOW_TARGET_WORLD,
  WORKFLOW_POSTGRES_URL: process.env.WORKFLOW_POSTGRES_URL ? '[SET]' : '[NOT SET]',
  WORKFLOW_POSTGRES_JOB_PREFIX: process.env.WORKFLOW_POSTGRES_JOB_PREFIX,
});

