#!/usr/bin/env node

/**
 * Monorepo Contributor Setup Script
 *
 * Usage:
 *   pnpm setup-dev                       - Run full setup with local Docker databases
 *   pnpm setup-dev --skip-push           - Run setup without pushing a project
 *   pnpm setup-dev --isolated <name>     - Run setup with an isolated parallel environment
 *
 * The --isolated flag creates a separate Docker environment with dynamic port
 * allocation, allowing multiple dev environments to run in parallel with zero
 * port conflicts. After setup, use:
 *   source <(./scripts/isolated-env.sh env <name>)
 *   pnpm dev
 *
 * This replaces the old scripts/setup.sh and uses the same shared setup module
 * as the quickstart template (create-agents-template/scripts/setup.js).
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { runSetup } from '../packages/agents-core/dist/setup/index.js';

const skipPush = process.argv.includes('--skip-push');
const isolatedIdx = process.argv.indexOf('--isolated');
const isolatedName = isolatedIdx !== -1 ? process.argv[isolatedIdx + 1] : null;

if (isolatedIdx !== -1 && (!isolatedName || isolatedName.startsWith('-'))) {
  console.error('Error: --isolated requires a name argument (e.g., --isolated my-feature)');
  process.exit(1);
}

if (isolatedName) {
  // Isolated mode: delegate Docker + migrations + auth to isolated-env.sh,
  // then run the remaining setup steps (secrets, project push) via runSetup.
  const scriptPath = new URL('./isolated-env.sh', import.meta.url).pathname;

  if (!existsSync(scriptPath)) {
    console.error(`Error: ${scriptPath} not found`);
    process.exit(1);
  }

  console.log(`\n\x1b[1m=== Isolated Environment Setup: ${isolatedName} ===\x1b[0m\n`);

  try {
    execSync(`bash "${scriptPath}" setup "${isolatedName}"`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch {
    console.error('\x1b[31mFailed to set up isolated environment.\x1b[0m');
    process.exit(1);
  }

  // Read the isolated env's ports and set env vars so runSetup's
  // remaining steps (secrets, project push) use the right databases.
  const stateFile = `.isolated-envs/${isolatedName}.json`;
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    const p = state.ports;
    process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL =
      `postgresql://appuser:password@localhost:${p.doltgres}/inkeep_agents`;
    process.env.INKEEP_AGENTS_RUN_DATABASE_URL =
      `postgresql://appuser:password@localhost:${p.postgres}/inkeep_agents`;
    process.env.SPICEDB_ENDPOINT = `localhost:${p.spicedb_grpc}`;
  }

  // Run remaining setup steps (secrets generation, project push) but skip
  // Docker startup + migrations + auth (already done by isolated-env.sh).
  await runSetup({
    dockerComposeFile: 'docker-compose.dbs.yml',
    manageMigrateCommand: 'true',
    runMigrateCommand: 'true',
    authInitCommand: 'true',
    pushProject: skipPush ? undefined : {
      projectPath: 'agents-cookbook/template-projects/activities-planner',
      configPath: 'agents-cookbook/template-projects/inkeep.config.ts',
      apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
    },
    devApiCommand: 'pnpm turbo dev --filter @inkeep/agents-api',
    apiHealthUrl: 'http://localhost:3002/health',
    isCloud: true,
    skipPush,
  });

  console.log(`\n\x1b[1m=== To use this environment ===\x1b[0m`);
  console.log(`  source <(./scripts/isolated-env.sh env ${isolatedName})`);
  console.log(`  pnpm dev`);
  console.log(`\n\x1b[1m=== To tear down ===\x1b[0m`);
  console.log(`  ./scripts/isolated-env.sh down ${isolatedName}\n`);
} else {
  // Default mode: standard setup with docker-compose.dbs.yml
  await runSetup({
    dockerComposeFile: 'docker-compose.dbs.yml',
    manageMigrateCommand: 'pnpm db:manage:migrate',
    runMigrateCommand: 'pnpm db:run:migrate',
    authInitCommand: 'pnpm db:auth:init',
    pushProject: {
      projectPath: 'agents-cookbook/template-projects/activities-planner',
      configPath: 'agents-cookbook/template-projects/inkeep.config.ts',
      apiKey: process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
    },
    devApiCommand: 'pnpm turbo dev --filter @inkeep/agents-api',
    apiHealthUrl: 'http://localhost:3002/health',
    isCloud: false,
    skipPush,
  });
}
