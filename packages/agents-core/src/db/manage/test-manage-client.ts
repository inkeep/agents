import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { AgentsManageDatabaseClient } from './manage-client';
import * as schema from './manage-schema';
import { sql } from 'drizzle-orm';


/**
 * Creates a test database client using an in-memory PostgreSQL database (PGlite)
 * This provides real database operations for integration testing with perfect isolation
 * Each call creates a fresh database with all migrations applied
 */
export async function createTestManageDatabaseClient(drizzleDir: string): Promise<AgentsManageDatabaseClient> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Initialize schema by running ALL migration SQL files
  try {
    await migrate(db, { migrationsFolder: drizzleDir });
  } catch (error) {
    console.error('Failed to initialize test database schema:', error);
    throw error;
  }

  return db;
}

export function createTestManageDatabaseClientNoMigrations(): AgentsManageDatabaseClient {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  return db;
}



/**
 * Cleans up test database by removing all data but keeping schema
 * Dynamically gets all tables from the public schema and truncates them
 */
export async function cleanupTestManageDatabase(db: AgentsManageDatabaseClient): Promise<void> {
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
    console.debug('Could not clean test database:', error);
  }
}

/**
 * Closes the test database and removes the file
 */
export async function closeTestManageDatabase(db: AgentsManageDatabaseClient): Promise<void> {
  // Close the database connection
  try {
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
  } catch (error) {
    console.debug('Error closing database:', error);
  }
}


/**
 * Creates a test project in the database
 * NOTE: original implementation ensured the organization exists first but that is a runtime db entity now
 */
export async function createTestProject(
  db: AgentsManageDatabaseClient,
  tenantId: string,
  projectId = 'default'
): Promise<void> {

  await db
    .insert(schema.projects)
    .values({
      tenantId,
      id: projectId,
      name: `Test Project ${projectId}`,
      description: `Test project for ${projectId}`,
    })
    .onConflictDoNothing();
}