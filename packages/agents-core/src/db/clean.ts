import { AgentsManageDatabaseClient } from './manage/manage-client';
import { AgentsRunDatabaseClient } from './runtime/runtime-client';
import { sql } from 'drizzle-orm';

/**
 * Cleans up test database by removing all data but keeping schema
 * Dynamically gets all tables from the public schema and truncates them
 */
export async function cleanupDatabase(
  db: AgentsManageDatabaseClient | AgentsRunDatabaseClient
): Promise<void> {
  try {
    // Get all table names from the public schema
    const result = await db.execute(
      sql.raw(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `)
    );

    const tables = result.rows.map((row: any) => row.tablename);

    if (tables.length === 0) {
      return;
    }

    // Use TRUNCATE with CASCADE to handle foreign key constraints automatically
    // RESTART IDENTITY resets any sequences (auto-increment counters)
    const tableList = tables.map((t: string) => `"${t}"`).join(', ');
    await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`));
  } catch (error) {
    console.debug('Could not clean database:', error);
  }
}
