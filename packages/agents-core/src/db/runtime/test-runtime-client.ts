import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { AgentsRunDatabaseClient } from './runtime-client';
import * as schema from './runtime-schema';
import { sql } from 'drizzle-orm';

/**
 * Creates a test database client using an in-memory PostgreSQL database (PGlite)
 * This provides real database operations for integration testing with perfect isolation
 * Each call creates a fresh database with all migrations applied
 */
export async function createTestRuntimeDatabaseClient(
  drizzleDir: string
): Promise<AgentsRunDatabaseClient> {
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

export function createTestRuntimeDatabaseClientNoMigrations(): AgentsRunDatabaseClient {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  return db;
}

/**
 * Cleans up test database by removing all data but keeping schema
 * Dynamically gets all tables from the public schema and truncates them
 */
export async function cleanupTestRuntimeDatabase(db: AgentsRunDatabaseClient): Promise<void> {
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
export async function closeTestRuntimeDatabase(db: AgentsRunDatabaseClient): Promise<void> {
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
 * Creates a test organization in the database
 * This is a helper for tests that need organization records before creating projects/agents
 */
export async function createTestOrganization(
  db: AgentsRunDatabaseClient,
  tenantId: string
): Promise<void> {
  const slug = tenantId.replace(/^test-tenant-/, '').substring(0, 50);

  await db
    .insert(schema.organization)
    .values({
      id: tenantId,
      name: `Test Organization ${tenantId}`,
      slug,
      createdAt: new Date(),
      metadata: null,
    })
    .onConflictDoNothing();
}
