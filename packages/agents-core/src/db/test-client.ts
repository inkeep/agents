import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export type DatabaseClient = LibSQLDatabase<typeof schema>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates a test database client using an in-memory SQLite database
 * This provides real database operations for integration testing with perfect isolation
 * Each call creates a fresh database with all migrations applied
 */
export async function createTestDatabaseClient(): Promise<DatabaseClient> {
  // Create in-memory database client
  const client = createClient({
    url: ':memory:',
  });

  const db = drizzle(client, { schema });

  // Initialize schema by running ALL migration SQL files
  try {
    const drizzleDir = join(__dirname, '../../drizzle');
    const files = readdirSync(drizzleDir);

    // Find all SQL migration files and sort them
    const migrationFiles = files.filter((f) => f.endsWith('.sql')).sort(); // This sorts 0000_, 0001_, 0002_, etc. in order

    if (migrationFiles.length === 0) {
      throw new Error('No migration files found. Run: pnpm drizzle-kit generate');
    }

    // Run all migrations in order
    for (const migrationFile of migrationFiles) {
      const migrationPath = join(drizzleDir, migrationFile);
      const migrationSql = readFileSync(migrationPath, 'utf8');

      // Parse and execute SQL statements
      const statements = migrationSql
        .split('-->')
        .map((s) => s.replace(/statement-breakpoint/g, '').trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        // Execute all SQL statements (CREATE, ALTER, etc.)
        if (statement.trim().length > 0) {
          await db.run(sql.raw(statement));
        }
      }
    }
  } catch (error) {
    console.error('Failed to initialize test database schema:', error);
    throw error;
  }

  return db;
}

/**
 * Cleans up test database by removing all data but keeping schema
 * @deprecated Use fresh in-memory databases with beforeEach instead for better test isolation
 */
export async function cleanupTestDatabase(db: DatabaseClient): Promise<void> {
  // Delete data from tables in reverse dependency order to handle foreign keys
  const cleanupTables = [
    'messages',
    'conversations',
    'tasks',
    'task_relations',
    'agent_relations',
    'agent_graph',
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
    'functions', // Global functions table
    'projects',
  ];

  for (const table of cleanupTables) {
    try {
      await db.run(sql.raw(`DELETE FROM ${table}`));
    } catch (error) {
      // Table might not exist, continue with others
      console.debug(`Could not clean table ${table}:`, error);
    }
  }

  // Reset auto-increment counters
  try {
    await db.run(sql.raw(`DELETE FROM sqlite_sequence`));
  } catch {
    // sqlite_sequence might not exist if no auto-increment columns used
  }
}

/**
 * Closes the test database and removes the file
 * @deprecated Use in-memory databases which auto-cleanup instead
 */
export async function closeTestDatabase(db: DatabaseClient, testDbPath: string): Promise<void> {
  // Close the database connection
  try {
    if ('close' in db && typeof db.close === 'function') {
      db.close();
    }
  } catch (error) {
    console.debug('Error closing database:', error);
  }

  // Remove the test database file
  try {
    unlinkSync(testDbPath);
  } catch (error) {
    console.debug('Could not remove test database file:', testDbPath, error);
  }
}

/**
 * Creates an in-memory database client for very fast unit tests
 * Note: This requires schema initialization which can be complex
 */
export function createInMemoryDatabaseClient(): DatabaseClient {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });

  // For in-memory, we'd need to create the schema manually
  // Using the test file approach is more reliable
  return db;
}
