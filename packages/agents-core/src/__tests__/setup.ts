import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createDatabaseClient } from '../db/client.js';
import { getLogger } from '../utils/logger.js';

// Create test database client using in-memory database
const dbClient = createDatabaseClient({ url: ':memory:' });

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    // Temporarily disable foreign key constraints for tests due to composite key issues
    await dbClient.run(sql`PRAGMA foreign_keys = OFF`);

    await migrate(dbClient, { migrationsFolder: './drizzle' });
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
