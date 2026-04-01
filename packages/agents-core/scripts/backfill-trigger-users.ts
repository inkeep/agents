/**
 * One-time backfill script: Copy runAsUserId from scheduled_triggers into scheduled_trigger_users
 *
 * Background:
 *   As part of the multi-user scheduled triggers migration (Phase 2), existing triggers that
 *   have a scalar `runAsUserId` need their user association copied into the new join table
 *   `scheduled_trigger_users`. This enables the dispatcher to read from a single source
 *   (the join table) for both legacy single-user and new multi-user triggers.
 *
 * What it does:
 *   1. Connects to the runtime database (Postgres).
 *   2. Queries all `scheduled_triggers` where `run_as_user_id IS NOT NULL`.
 *   3. For each trigger, inserts a row into `scheduled_trigger_users` with:
 *      - tenant_id = trigger's tenant_id
 *      - scheduled_trigger_id = trigger's id
 *      - user_id = trigger's run_as_user_id
 *      - created_at = NOW()
 *   4. Uses ON CONFLICT DO NOTHING for idempotency (safe to re-run).
 *   5. Logs the count of backfilled triggers.
 *
 * Usage:
 *   # Dry-run (default) — prints what would be backfilled without writing
 *   npx tsx packages/agents-core/scripts/backfill-trigger-users.ts
 *
 *   # Apply — actually writes to the runtime database
 *   npx tsx packages/agents-core/scripts/backfill-trigger-users.ts --apply
 *
 * Prerequisites:
 *   - INKEEP_AGENTS_RUN_DATABASE_URL must be set.
 *   - Runtime DB must have both `scheduled_triggers` and `scheduled_trigger_users` tables.
 *   - Run from monorepo root with env vars exported:
 *       export $(grep -v '^#' .env | xargs) && npx tsx packages/agents-core/scripts/...
 */

import { isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as runtimeSchema from '../src/db/runtime/runtime-schema';

const RUNTIME_DB_URL = process.env.INKEEP_AGENTS_RUN_DATABASE_URL;

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  if (!RUNTIME_DB_URL) {
    console.error('INKEEP_AGENTS_RUN_DATABASE_URL is not set');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('=== DRY RUN (pass --apply to execute writes) ===\n');
  }

  const runtimePool = new Pool({ connectionString: RUNTIME_DB_URL, max: 2 });
  const runtimeDb = drizzle(runtimePool, { schema: runtimeSchema });

  try {
    const triggersWithUser = await runtimeDb
      .select({
        tenantId: runtimeSchema.scheduledTriggers.tenantId,
        id: runtimeSchema.scheduledTriggers.id,
        runAsUserId: runtimeSchema.scheduledTriggers.runAsUserId,
      })
      .from(runtimeSchema.scheduledTriggers)
      .where(isNotNull(runtimeSchema.scheduledTriggers.runAsUserId));

    console.log(
      `Found ${triggersWithUser.length} trigger(s) with runAsUserId set\n`
    );

    let backfilled = 0;
    let skipped = 0;

    for (const trigger of triggersWithUser) {
      const userId = trigger.runAsUserId as string;

      console.log(
        `  ${DRY_RUN ? '[DRY]' : '[WRITE]'} trigger ${trigger.tenantId}/${trigger.id} → user ${userId}`
      );

      if (!DRY_RUN) {
        const result = await runtimeDb
          .insert(runtimeSchema.scheduledTriggerUsers)
          .values({
            tenantId: trigger.tenantId,
            scheduledTriggerId: trigger.id,
            userId,
          })
          .onConflictDoNothing();

        if (result.rowCount === 0) {
          skipped++;
        } else {
          backfilled++;
        }
      } else {
        backfilled++;
      }
    }

    console.log(
      `\n${DRY_RUN ? 'Would backfill' : 'Backfilled'} ${backfilled} trigger-user association(s)` +
        (skipped > 0 ? `, skipped ${skipped} (already existed)` : '')
    );
  } finally {
    await runtimePool.end();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
