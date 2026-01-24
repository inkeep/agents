import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { AgentsManageDatabaseClient } from './manage-client';
import * as schema from './manage-schema';

function findSnapshotPath(filename: string): string | null {
  const possiblePaths = [
    resolve(process.cwd(), 'test-fixtures', filename),
    resolve(process.cwd(), '..', 'test-fixtures', filename),
    resolve(process.cwd(), '..', '..', 'test-fixtures', filename),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

/**
 * Creates a test database client using an in-memory PostgreSQL database (PGlite)
 * This provides real database operations for integration testing with perfect isolation
 * Each call creates a fresh database with all migrations applied
 *
 * If a pre-compiled snapshot exists at test-fixtures/manage-db-snapshot.tar.gz,
 * it will be loaded instead of running migrations, significantly speeding up test initialization.
 * Run `pnpm test:generate-snapshot` to regenerate the snapshot after schema changes.
 */
export async function createTestManageDatabaseClient(
  drizzleDir: string
): Promise<AgentsManageDatabaseClient> {
  const snapshotPath = findSnapshotPath('manage-db-snapshot.tar.gz');

  let client: PGlite;

  if (snapshotPath) {
    const snapshotData = readFileSync(snapshotPath);
    const blob = new Blob([snapshotData], { type: 'application/gzip' });
    client = new PGlite({ loadDataDir: blob });
  } else {
    client = new PGlite();
    const db = drizzle(client, { schema });

    try {
      await migrate(db, { migrationsFolder: drizzleDir });
    } catch (error) {
      console.error('Failed to initialize test database schema:', error);
      throw error;
    }
  }

  return drizzle(client, { schema });
}

/**
 * Creates a test database client without running migrations.
 *
 * If a pre-compiled snapshot exists at test-fixtures/manage-db-snapshot.tar.gz,
 * it will be loaded (providing schema without running migrations).
 * Otherwise, returns an empty database (caller must run migrations).
 * Run `pnpm test:generate-snapshot` to regenerate the snapshot after schema changes.
 */
export function createTestManageDatabaseClientNoMigrations(): AgentsManageDatabaseClient {
  const snapshotPath = findSnapshotPath('manage-db-snapshot.tar.gz');

  let client: PGlite;

  if (snapshotPath) {
    const snapshotData = readFileSync(snapshotPath);
    const blob = new Blob([snapshotData], { type: 'application/gzip' });
    client = new PGlite({ loadDataDir: blob });
  } else {
    client = new PGlite();
  }

  return drizzle(client, { schema });
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
