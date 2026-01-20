/**
 * Migration Script: Clean up triggers with old authentication format
 *
 * This migration removes all triggers that have the old authentication format.
 * The old format used:
 *   { type: 'api_key' | 'basic_auth' | 'bearer_token' | 'none', data: {...} }
 *
 * The new format uses:
 *   { headers: [{ name: string, valueHash: string, valuePrefix: string }] }
 *
 * Existing triggers with the old format will fail validation, so this script
 * removes them. Users will need to recreate their triggers with the new format.
 *
 * Usage:
 *   pnpm db:migrate:cleanup-old-triggers
 */

import { sql } from 'drizzle-orm';
import { loadEnvironmentFiles } from '../../env';
import { getLogger } from '../../utils/logger';
import { createAgentsManageDatabaseClient } from '../manage/manage-client';

const logger = getLogger('migration:cleanup-old-trigger-auth');

async function cleanupOldTriggerAuth() {
  loadEnvironmentFiles();

  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  if (!connectionString) {
    console.error('❌ INKEEP_AGENTS_MANAGE_DATABASE_URL not set');
    process.exit(1);
  }

  const db = createAgentsManageDatabaseClient({ connectionString });

  console.log('🔍 Checking for triggers with old authentication format...\n');

  // Find triggers that have the old authentication format (have a "type" field)
  const oldFormatTriggers = await db.execute<{
    tenant_id: string;
    project_id: string;
    agent_id: string;
    id: string;
    name: string;
  }>(
    sql`
      SELECT tenant_id, project_id, agent_id, id, name
      FROM triggers
      WHERE authentication IS NOT NULL
        AND authentication->>'type' IS NOT NULL
    `
  );

  const triggersToDelete = oldFormatTriggers.rows || [];

  if (triggersToDelete.length === 0) {
    console.log('✅ No triggers with old authentication format found. Nothing to do.\n');
    process.exit(0);
  }

  console.log(`Found ${triggersToDelete.length} trigger(s) with old authentication format:\n`);
  for (const trigger of triggersToDelete) {
    console.log(`  - ${trigger.name} (ID: ${trigger.id})`);
    console.log(
      `    Tenant: ${trigger.tenant_id}, Project: ${trigger.project_id}, Agent: ${trigger.agent_id}`
    );
  }

  console.log(
    '\n⚠️  These triggers will be DELETED because they use the old authentication format.'
  );
  console.log('   Users will need to recreate them with the new header-based authentication.\n');

  // Delete triggers with old format
  await db.execute(
    sql`
      DELETE FROM triggers
      WHERE authentication IS NOT NULL
        AND authentication->>'type' IS NOT NULL
    `
  );

  console.log(`✅ Deleted ${triggersToDelete.length} trigger(s) with old authentication format.\n`);

  logger.info(
    { deletedCount: triggersToDelete.length, triggers: triggersToDelete },
    'Cleaned up triggers with old authentication format'
  );

  process.exit(0);
}

cleanupOldTriggerAuth().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
