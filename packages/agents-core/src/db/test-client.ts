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

/**
 * Cleans up test database by removing all data but keeping schema
 * Dynamically gets all tables from the public schema and truncates them
 */
export async function cleanupTestDatabase(db: DatabaseClient): Promise<void> {
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

/**
 * Creates a test organization in the database
 * This is a helper for tests that need organization records before creating projects/agents
 */
export async function createTestOrganization(
  db: DatabaseClient,
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

/**
 * Creates a test project in the database
 * Ensures the organization exists first
 */
export async function createTestProject(
  db: DatabaseClient,
  tenantId: string,
  projectId = 'default'
): Promise<void> {
  await createTestOrganization(db, tenantId);
  
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
