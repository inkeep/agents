import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createDatabaseClient } from '../db/client';
import { getLogger } from '../utils/logger';

// Create test database client using in-memory database
const dbClient = createDatabaseClient({ url: ':memory:' });

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    // Temporarily disable foreign key constraints for tests due to composite key issues
    await dbClient.run(sql`PRAGMA foreign_keys = OFF`);

    // Use absolute path to ensure migrations are found correctly
    const projectRoot = process.cwd().includes('packages/agents-core')
      ? process.cwd()
      : path.join(process.cwd(), 'packages/agents-core');

    const migrationsPath = path.join(projectRoot, 'drizzle');

    await migrate(dbClient, { migrationsFolder: migrationsPath });
  } catch (error) {
    logger.error({ error }, 'Failed to apply database migrations');
    throw error;
  }
});

afterEach(() => {
  // Any cleanup if needed
});

afterAll(() => {
  // Any final cleanup if needed
});

// Export the test database client for use in tests
export { dbClient };
