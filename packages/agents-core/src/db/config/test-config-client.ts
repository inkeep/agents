import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { AgentsManageDatabaseClient } from './config-client';
import * as schema from './config-schema';


/**
 * Creates a test database client using an in-memory PostgreSQL database (PGlite)
 * This provides real database operations for integration testing with perfect isolation
 * Each call creates a fresh database with all migrations applied
 */
export async function createTestConfigDatabaseClient(drizzleDir: string): Promise<AgentsManageDatabaseClient> {
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

export function createTestConfigDatabaseClientNoMigrations(): AgentsManageDatabaseClient {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  return db;
}

/**
 * Closes the test database and removes the file
 */
export async function closeTestConfigDatabase(db: AgentsManageDatabaseClient): Promise<void> {
  // Close the database connection
  try {
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
  } catch (error) {
    console.debug('Error closing database:', error);
  }
}
