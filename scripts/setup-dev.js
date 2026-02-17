#!/usr/bin/env node

/**
 * Monorepo Contributor Setup Script
 *
 * Usage:
 *   pnpm setup-dev              - Run full setup with local Docker databases
 *   pnpm setup-dev --skip-push  - Run setup without pushing a project
 *   pnpm setup-dev --cloud      - Skip Docker startup (databases managed externally)
 *
 * This replaces the old scripts/setup.sh and uses the same shared setup module
 * as the quickstart template (create-agents-template/scripts/setup.js).
 */

import { runSetup } from '../packages/agents-core/dist/setup/index.js';

const skipPush = process.argv.includes('--skip-push');
const isCloud = process.argv.includes('--cloud');

await runSetup({
  dockerComposeFile: 'docker-compose.dbs.yml',
  manageMigrateCommand: 'pnpm db:manage:migrate',
  runMigrateCommand: 'pnpm db:run:migrate',
  authInitCommand: 'pnpm db:auth:init',
  pushProject: {
    projectPath: 'agents-cookbook/template-projects/weather-project',
    configPath: 'agents-cookbook/template-projects/inkeep.config.ts',
    apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
  },
  devApiCommand: 'pnpm turbo dev --filter @inkeep/agents-api',
  apiHealthUrl: 'http://localhost:3002/health',
  isCloud,
  skipPush,
});
