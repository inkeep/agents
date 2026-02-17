#!/usr/bin/env node

/**
 * Project Setup Script
 *
 * Usage:
 *   pnpm setup-dev              - Run setup with local Docker database
 *   pnpm setup-dev:cloud        - Run setup for cloud deployment (skips Docker)
 */

import { loadEnvironmentFiles } from '@inkeep/agents-core';
import { runSetup } from '@inkeep/agents-core/setup';
import dotenv from 'dotenv';

loadEnvironmentFiles();
dotenv.config();

const projectId = process.env.DEFAULT_PROJECT_ID;
if (!projectId) {
  console.error('DEFAULT_PROJECT_ID environment variable is not set');
  process.exit(1);
}

const isCloud = process.argv.includes('--cloud');

await runSetup({
  dockerComposeFile: 'docker-compose.db.yml',
  manageMigrateCommand: 'pnpm db:manage:migrate',
  runMigrateCommand: 'pnpm db:run:migrate',
  authInitCommand: 'node node_modules/@inkeep/agents-core/dist/auth/init.js',
  upgradeCommand: 'pnpm upgrade-agents',
  pushProject: {
    projectPath: `src/projects/${projectId}`,
    configPath: 'src/inkeep.config.ts',
    apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
  },
  devApiCommand: 'pnpm dev:api',
  devUiCommand: 'pnpm dev:ui',
  apiHealthUrl: 'http://localhost:3002/health',
  uiHealthUrl: 'http://localhost:3000',
  isCloud,
});
