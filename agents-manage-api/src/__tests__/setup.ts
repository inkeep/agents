import { getLogger } from '@inkeep/agents-core';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, afterEach, beforeAll } from 'vitest';
import dbClient from '../data/db/dbClient';

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    // Temporarily disable foreign key constraints for tests due to composite key issues
    await dbClient.run(sql`PRAGMA foreign_keys = OFF`);

    // Use path relative to project root to work with both direct and turbo execution
    const migrationsPath = process.cwd().includes('agents-manage-api')
      ? '../packages/agents-core/drizzle'
      : './packages/agents-core/drizzle';

    await migrate(dbClient, { migrationsFolder: migrationsPath });
    logger.debug({}, 'Database migrations applied successfully');
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
