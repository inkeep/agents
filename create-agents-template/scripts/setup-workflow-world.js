#!/usr/bin/env node
/**
 * Create/upgrade the @workflow/world-postgres schema used by durable execution.
 *
 * No-op unless WORKFLOW_TARGET_WORLD=@workflow/world-postgres, so it is safe to run on
 * every migrate. The bootstrap is idempotent and reads WORKFLOW_POSTGRES_URL.
 */
import { spawnSync } from 'node:child_process';

if (process.env.WORKFLOW_TARGET_WORLD !== '@workflow/world-postgres') {
  console.log(
    'WORKFLOW_TARGET_WORLD is not @workflow/world-postgres; skipping workflow world setup'
  );
  process.exit(0);
}

if (!process.env.WORKFLOW_POSTGRES_URL) {
  console.error(
    'WORKFLOW_POSTGRES_URL must be set when WORKFLOW_TARGET_WORLD=@workflow/world-postgres'
  );
  process.exit(1);
}

const result = spawnSync('pnpm', ['--filter', 'agents-api-quickstart', 'exec', 'bootstrap'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
