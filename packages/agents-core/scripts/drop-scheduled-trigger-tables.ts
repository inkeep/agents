/**
 * One-time script: drop deprecated scheduled_triggers / scheduled_workflows tables
 * from every non-main Doltgres branch.
 *
 * Background:
 *   The Drizzle migration (0014) drops these tables on `main`, but merging main
 *   into branches fails because Doltgres can't reconcile the FK
 *   `scheduled_workflows_trigger_fk` during merge resolution ("CASCADE is not yet
 *   supported"). This script pre-drops the tables on every non-main branch so that
 *   the subsequent schema sync merge from main completes cleanly.
 *
 * What it does:
 *   1. Connects to Doltgres (manage).
 *   2. Lists all branches via `dolt_branches`.
 *   3. Skips `main` (already handled by the Drizzle migration).
 *   4. For each branch, checks out via a dedicated connection.
 *   5. Checks whether `scheduled_triggers` exists on that branch.
 *   6. Drops `scheduled_workflows` first (child FK), then `scheduled_triggers`.
 *   7. Commits the drop with an auto-staged commit.
 *   8. Checks out `main` and releases the connection.
 *
 * Usage:
 *   # Dry-run (default) — prints what would be dropped without writing
 *   export $(grep -v '^#' .env | xargs) && npx tsx packages/agents-core/scripts/drop-scheduled-trigger-tables.ts
 *
 *   # Apply — actually drops from Doltgres
 *   export $(grep -v '^#' .env | xargs) && npx tsx packages/agents-core/scripts/drop-scheduled-trigger-tables.ts --apply
 *
 * Prerequisites:
 *   - INKEEP_AGENTS_MANAGE_DATABASE_URL must be set.
 *   - The Drizzle migration (0014) should already be applied on main.
 *   - After running this script with --apply, run migrate-all-branches to merge main.
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as manageSchema from '../src/db/manage/manage-schema';

const MANAGE_DB_URL = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  if (!MANAGE_DB_URL) {
    console.error('INKEEP_AGENTS_MANAGE_DATABASE_URL is not set. Export your .env first:');
    console.error("  export $(grep -v '^#' .env | xargs)");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('=== DRY RUN (pass --apply to execute drops) ===\n');
  }

  const pool = new Pool({ connectionString: MANAGE_DB_URL, max: 2 });
  const db = drizzle(pool, { schema: manageSchema });

  try {
    const branches = await db.execute<{ name: string; hash: string }>(
      sql`SELECT name, hash FROM dolt_branches`
    );

    console.log(`Found ${branches.rows.length} branches in Doltgres\n`);

    let droppedCount = 0;
    let skippedCount = 0;

    for (const branch of branches.rows) {
      const branchName = branch.name;

      if (branchName === 'main') {
        console.log(`Branch "main": skipped (handled by Drizzle migration)`);
        continue;
      }

      const connection = await pool.connect();
      try {
        await connection.query(`SELECT DOLT_CHECKOUT('${branchName}')`);

        const tableCheck = await connection.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scheduled_triggers' LIMIT 1`
        );

        if (tableCheck.rows.length === 0) {
          console.log(`Branch "${branchName}": skipped (no scheduled_triggers table)`);
          skippedCount++;
          continue;
        }

        if (DRY_RUN) {
          console.log(
            `Branch "${branchName}": would drop scheduled_workflows + scheduled_triggers`
          );
        } else {
          await connection.query('DROP TABLE IF EXISTS "scheduled_workflows"');
          await connection.query('DROP TABLE IF EXISTS "scheduled_triggers"');
          await connection.query(
            `SELECT DOLT_COMMIT('-a', '-m', 'Drop deprecated scheduled_triggers and scheduled_workflows (migrated to runtime)', '--author', 'migration-script <migration@inkeep.com>')`
          );
          console.log(`Branch "${branchName}": dropped tables and committed`);
        }

        droppedCount++;
      } finally {
        try {
          await connection.query(`SELECT DOLT_CHECKOUT('main')`);
        } catch {
          // best-effort checkout back to main
        }
        connection.release();
      }
    }

    console.log(
      `\n${DRY_RUN ? 'Would drop on' : 'Dropped on'} ${droppedCount} branch(es), skipped ${skippedCount}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
