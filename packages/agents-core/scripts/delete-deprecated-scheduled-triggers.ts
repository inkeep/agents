/**
 * One-time cleanup script: delete deprecated scheduled_triggers from Doltgres
 *
 * Background:
 *   Scheduled triggers have been migrated to the runtime database (Postgres) via
 *   migrate-triggers-to-runtime.ts. The manage-side tables in Doltgres are now dead
 *   data. This script removes them from every branch.
 *
 * What it does:
 *   1. Connects to Doltgres (manage).
 *   2. Lists all branches via `dolt_branches`.
 *   3. For each branch, checks out the branch on a dedicated connection.
 *   4. Counts existing `scheduled_triggers` rows.
 *   5. Deletes all rows from `scheduled_triggers` (cascades to `scheduled_workflows`
 *      via the `scheduled_workflows_trigger_fk` ON DELETE CASCADE).
 *   6. Commits the deletion with an auto-staged commit.
 *   7. Checks out `main` and releases the connection.
 *   Branches that predate the `scheduled_triggers` table are skipped gracefully.
 *
 * Usage:
 *   # Dry-run (default) — prints what would be deleted without writing
 *   export $(grep -v '^#' .env | xargs) && npx tsx packages/agents-core/scripts/delete-deprecated-scheduled-triggers.ts
 *
 *   # Apply — actually deletes from Doltgres
 *   export $(grep -v '^#' .env | xargs) && npx tsx packages/agents-core/scripts/delete-deprecated-scheduled-triggers.ts --apply
 *
 * Prerequisites:
 *   - INKEEP_AGENTS_MANAGE_DATABASE_URL must be set.
 *   - Triggers should already be migrated to runtime (run migrate-triggers-to-runtime.ts first).
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
    console.log('=== DRY RUN (pass --apply to execute deletes) ===\n');
  }

  const pool = new Pool({ connectionString: MANAGE_DB_URL, max: 2 });
  const db = drizzle({ client: pool, schema: manageSchema });

  try {
    const branches = await db.execute<{ name: string; hash: string }>(
      sql`SELECT name, hash FROM dolt_branches`
    );

    console.log(`Found ${branches.rows.length} branches in Doltgres\n`);

    let totalDeleted = 0;
    let totalSkipped = 0;

    for (const branch of branches.rows) {
      const branchName = branch.name;

      const connection = await pool.connect();
      try {
        await connection.query(`SELECT DOLT_CHECKOUT('${branchName}')`);

        let countResult: { rows: { count: string }[] };
        try {
          countResult = await connection.query(
            'SELECT COUNT(*)::text AS count FROM scheduled_triggers'
          );
        } catch (err) {
          const errMsg = (err as Error).message || '';
          if (errMsg.includes('does not exist') || errMsg.includes('relation')) {
            console.log(`Branch "${branchName}": skipped (no scheduled_triggers table)`);
            totalSkipped++;
            continue;
          }
          throw err;
        }

        const count = Number(countResult.rows[0]?.count ?? 0);
        if (count === 0) {
          continue;
        }

        console.log(
          `Branch "${branchName}": ${count} trigger(s) ${DRY_RUN ? 'would be deleted' : 'deleting...'}`
        );

        if (!DRY_RUN) {
          await connection.query('DELETE FROM scheduled_triggers');
          await connection.query(
            `SELECT DOLT_COMMIT('-a', '-m', 'Remove deprecated scheduled_triggers (migrated to runtime)', '--author', 'migration-script <migration@inkeep.com>')`
          );
          console.log(`  Committed deletion on branch "${branchName}"`);
        }

        totalDeleted += count;
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
      `\n${DRY_RUN ? 'Would delete' : 'Deleted'} ${totalDeleted} trigger(s) across all branches, skipped ${totalSkipped} branch(es)`
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
