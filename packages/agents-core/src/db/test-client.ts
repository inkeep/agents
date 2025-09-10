import { mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

export type DatabaseClient = LibSQLDatabase<typeof schema>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path for test database - unique per test run to avoid conflicts
const TEST_DB_DIR = join(__dirname, '../../../temp');

/**
 * Creates a test database client for a test suite using a temporary SQLite file
 * This provides real database operations for integration testing
 */
export async function createTestDatabaseClient(
  suiteName?: string
): Promise<{ client: DatabaseClient; path: string }> {
  // Generate database path for the test suite
  const testDbPath = join(
    TEST_DB_DIR,
    `${suiteName || 'test'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`
  );

  // Ensure temp directory exists
  try {
    mkdirSync(TEST_DB_DIR, { recursive: true });
  } catch {
    // Directory already exists, that's fine
  }

  // Create database client with file
  const client = createClient({
    url: `file:${testDbPath}`,
  });

  const db = drizzle(client, { schema });

  // Initialize schema by running migration SQL
  try {
    // Find the first migration file dynamically (drizzle uses random names)
    const drizzleDir = join(__dirname, '../../drizzle');
    const files = readdirSync(drizzleDir);
    const migrationFile = files.find((f) => f.startsWith('0000_') && f.endsWith('.sql'));

    if (!migrationFile) {
      throw new Error('No migration file found. Run: pnpm drizzle-kit generate');
    }

    const migrationPath = join(drizzleDir, migrationFile);
    const migrationSql = readFileSync(migrationPath, 'utf8');

    // Parse and execute SQL statements
    const statements = migrationSql
      .split('-->')
      .map((s) => s.replace(/statement-breakpoint/g, '').trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (
        statement.includes('CREATE TABLE') ||
        statement.includes('CREATE INDEX') ||
        statement.includes('CREATE UNIQUE INDEX')
      ) {
        await db.run(sql.raw(statement));
      }
    }
  } catch (error) {
    console.error('Failed to initialize test database schema:', error);
    throw error;
  }

  return { client: db, path: testDbPath };
}

/**
 * Cleans up test database by removing all data but keeping schema
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
    'tools',
    'agents',
    'api_keys',
    'context_cache',
    'ledger_artifacts',
    'agent_artifact_components',
    'agent_data_components',
    'agent_tool_relations',
    'artifact_components',
    'context_configs',
    'credential_references',
    'data_components',
    'external_agents',
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
