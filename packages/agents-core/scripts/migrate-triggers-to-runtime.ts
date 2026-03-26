/**
 * One-time migration script: Doltgres scheduled_triggers → Postgres scheduled_triggers
 *
 * Background:
 *   Scheduled triggers were originally stored in the manage database (Doltgres), which is
 *   a versioned/branch-scoped config store. They have been moved to the runtime database
 *   (Postgres) because triggers are live scheduling state, not versioned configuration.
 *   The manage-side tables are kept intact as dead data for rollback safety — this script
 *   copies the data to runtime without modifying the source.
 *
 * What it does:
 *   1. Connects to both Doltgres (manage) and Postgres (runtime).
 *   2. Lists all Doltgres branches via `dolt_branches`.
 *   3. For each branch, queries `scheduled_triggers AS OF '<branch>'` to read triggers
 *      as they exist on that branch. Branches that predate the scheduled_triggers table
 *      are skipped gracefully (the AS OF query throws "relation does not exist").
 *   4. For each trigger, computes `nextRunAt` using the cron expression or one-time runAt.
 *   5. Extracts the logical ref from the branch name. Doltgres branches follow the naming
 *      convention `{tenantId}_{projectId}_{ref}` (e.g., `default_test_main`). The runtime
 *      table stores only the logical ref (`main`), because the runner reconstructs the
 *      full branch name via `getProjectScopedRef(tenantId, projectId, ref)` at dispatch time.
 *   6. Upserts each trigger into the runtime `scheduled_triggers` table. The conflict target
 *      is the composite PK `(tenantId, id)`. If a trigger already exists (e.g., re-running
 *      the script), it updates all fields.
 *
 * Type coercions:
 *   - `max_retries`, `retry_delay_seconds`, `timeout_seconds` are `numeric` in Doltgres
 *     (returned as strings by the pg driver via raw SQL) but `integer` in runtime Postgres.
 *     Wrapped in `Number()` to coerce.
 *   - `payload` is `jsonb` in both DBs — the pg driver returns it as a parsed object, so
 *     no JSON.parse() is needed.
 *   - `createdAt` / `updatedAt` are timestamp strings in both schemas (mode: 'string').
 *
 * Usage:
 *   # Dry-run (default) — prints what would be migrated without writing
 *   npx tsx packages/agents-core/scripts/migrate-triggers-to-runtime.ts
 *
 *   # Apply — actually writes to the runtime database
 *   npx tsx packages/agents-core/scripts/migrate-triggers-to-runtime.ts --apply
 *
 * Prerequisites:
 *   - INKEEP_AGENTS_MANAGE_DATABASE_URL and INKEEP_AGENTS_RUN_DATABASE_URL must be set.
 *   - Runtime DB must have the `scheduled_triggers` table (migration 0025 applied).
 *   - Run from monorepo root with env vars exported:
 *       export $(grep -v '^#' .env | xargs) && npx tsx packages/agents-core/scripts/...
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as manageSchema from '../src/db/manage/manage-schema';
import * as runtimeSchema from '../src/db/runtime/runtime-schema';
import { computeNextRunAt } from '../src/utils/compute-next-run-at';

const MANAGE_DB_URL = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
const RUNTIME_DB_URL = process.env.INKEEP_AGENTS_RUN_DATABASE_URL;

type ManageScheduledTriggerRow = {
  tenant_id: string;
  id: string;
  project_id: string;
  agent_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  cron_expression: string | null;
  cron_timezone: string | null;
  run_at: string | null;
  payload: Record<string, unknown> | null;
  message_template: string | null;
  max_retries: string;
  retry_delay_seconds: string;
  timeout_seconds: string;
  run_as_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  if (DRY_RUN) {
    console.log('=== DRY RUN (pass --apply to execute writes) ===\n');
  }

  const managePool = new Pool({ connectionString: MANAGE_DB_URL, max: 2 });
  const runtimePool = new Pool({ connectionString: RUNTIME_DB_URL, max: 2 });

  const manageDb = drizzle(managePool, { schema: manageSchema });
  const runtimeDb = drizzle(runtimePool, { schema: runtimeSchema });

  try {
    const branches = await manageDb.execute<{ name: string; hash: string }>(
      sql`SELECT name, hash FROM dolt_branches`
    );

    console.log(`Found ${branches.rows.length} branches in Doltgres\n`);

    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const branch of branches.rows) {
      const branchName = branch.name;

      let triggers: { rows: ManageScheduledTriggerRow[] };

      try {
        triggers = await manageDb.execute<ManageScheduledTriggerRow>(
          sql.raw(`SELECT * FROM scheduled_triggers AS OF '${branchName}'`)
        );
      } catch (err) {
        const errMsg = (err as Error).message || '';
        if (errMsg.includes('does not exist') || errMsg.includes('relation')) {
          console.log(`Branch "${branchName}": skipped (no scheduled_triggers table)`);
          totalSkipped++;
          continue;
        }
        console.error(`Branch "${branchName}": UNEXPECTED ERROR — ${errMsg}`);
        throw err;
      }

      if (triggers.rows.length === 0) {
        continue;
      }

      console.log(`Branch "${branchName}": ${triggers.rows.length} trigger(s)`);

      for (const t of triggers.rows) {
        const prefix = `${t.tenant_id}_${t.project_id}_`;
        const refName = branchName.startsWith(prefix) ? branchName.slice(prefix.length) : 'main';
        const nextRunAt = t.enabled
          ? computeNextRunAt({
              cronExpression: t.cron_expression,
              cronTimezone: t.cron_timezone,
              runAt: t.run_at,
            })
          : null;

        console.log(
          `  ${DRY_RUN ? '[DRY]' : '[WRITE]'} ${t.tenant_id}/${t.project_id}/${t.agent_id}/${t.id} ` +
            `"${t.name}" enabled=${t.enabled} nextRunAt=${nextRunAt ?? 'null'} ref=${refName}`
        );

        if (!DRY_RUN) {
          const now = new Date().toISOString();
          const mutableFields = {
            name: t.name,
            description: t.description,
            enabled: t.enabled,
            cronExpression: t.cron_expression,
            cronTimezone: t.cron_timezone,
            runAt: t.run_at,
            payload: t.payload ?? null,
            messageTemplate: t.message_template,
            maxRetries: Number(t.max_retries),
            retryDelaySeconds: Number(t.retry_delay_seconds),
            timeoutSeconds: Number(t.timeout_seconds),
            runAsUserId: t.run_as_user_id,
            createdBy: t.created_by,
            nextRunAt,
            ref: refName,
            updatedAt: now,
          };

          await runtimeDb
            .insert(runtimeSchema.scheduledTriggers)
            .values({
              tenantId: t.tenant_id,
              id: t.id,
              projectId: t.project_id,
              agentId: t.agent_id,
              createdAt: t.created_at,
              ...mutableFields,
            })
            .onConflictDoUpdate({
              target: [
                runtimeSchema.scheduledTriggers.tenantId,
                runtimeSchema.scheduledTriggers.id,
              ],
              set: mutableFields,
            });
        }

        totalMigrated++;
      }
    }

    console.log(
      `\n${DRY_RUN ? 'Would migrate' : 'Migrated'} ${totalMigrated} trigger(s), skipped ${totalSkipped}`
    );
  } finally {
    await managePool.end();
    await runtimePool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
