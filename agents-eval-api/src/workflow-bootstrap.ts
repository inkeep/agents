/**
 * Bootstrap file for workflow configuration.
 * This file MUST be imported FIRST before any other imports in the application.
 * It sets up the environment variables needed for the workflow postgres world.
 */

import { loadEnvironmentFiles } from '@inkeep/agents-core';

// Load .env files from current dir and root monorepo
loadEnvironmentFiles();

// Set WORKFLOW_TARGET_WORLD to use postgres world
// This tells the workflow system to use @workflow/world-postgres instead of local world
if (!process.env.WORKFLOW_TARGET_WORLD) {
  process.env.WORKFLOW_TARGET_WORLD = '@workflow/world-postgres';
}

// Use DATABASE_URL as fallback for WORKFLOW_POSTGRES_URL
if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
}

// Set default job prefix if not set
if (!process.env.WORKFLOW_POSTGRES_JOB_PREFIX) {
  process.env.WORKFLOW_POSTGRES_JOB_PREFIX = 'inkeep-agents-eval';
}

console.log('[workflow-bootstrap] Configured workflow environment:', {
  WORKFLOW_TARGET_WORLD: process.env.WORKFLOW_TARGET_WORLD,
  WORKFLOW_POSTGRES_URL: process.env.WORKFLOW_POSTGRES_URL ? '[SET]' : '[NOT SET]',
  WORKFLOW_POSTGRES_JOB_PREFIX: process.env.WORKFLOW_POSTGRES_JOB_PREFIX,
});

