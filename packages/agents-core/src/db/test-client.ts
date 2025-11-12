import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DatabaseClient } from './client';
import * as schema from './schema';

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = dirname(FILENAME);

/**
 * Creates a test database client using an in-memory PostgreSQL database (PGlite)
 * This provides real database operations for integration testing with perfect isolation
 * Each call creates a fresh database with all migrations applied
 */
export async function createTestDatabaseClient(drizzleDir?: string): Promise<DatabaseClient> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Initialize schema by running ALL migration SQL files
  try {
    if (!drizzleDir) {
      drizzleDir = join(DIRNAME, '../../drizzle');
    }
    await migrate(db, { migrationsFolder: drizzleDir });
  } catch (error) {
    console.error('Failed to initialize test database schema:', error);
    throw error;
  }

  return db;
}

export function createTestDatabaseClientNoMigrations(): DatabaseClient {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  return db;
}

/**
 * Cleans up test database by removing all data but keeping schema
 */
export async function cleanupTestDatabase(db: DatabaseClient): Promise<void> {
  const cleanupTables = [
    'messages',
    'conversations',
    'tasks',
    'task_relations',
    'agent_relations',
    'agent',
    'agent_tool_relations',
    'tools',
    'agents',
    'api_keys',
    'context_cache',
    'ledger_artifacts',
    'agent_artifact_components',
    'agent_data_components',
    'artifact_components',
    'context_configs',
    'credential_references',
    'data_components',
    'external_agents',
    'functions',
    'projects',
  ];

  for (const table of cleanupTables) {
    try {
      await db.execute(sql.raw(`DELETE FROM "${table}"`));
    } catch (error) {
      console.debug(`Could not clean table ${table}:`, error);
    }
  }

  // PostgreSQL uses sequences for auto-increment, but we don't need to reset them
  // for test databases since we create a fresh database for each test
}

/**
 * Closes the test database and removes the file
 */
export async function closeTestDatabase(db: DatabaseClient): Promise<void> {
  // Close the database connection
  try {
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
  } catch (error) {
    console.debug('Error closing database:', error);
  }
}
