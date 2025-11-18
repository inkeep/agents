import { getLogger } from '@inkeep/agents-core';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll } from 'vitest';
import dbClient from '../data/db/dbClient';

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    // Use path relative to project root to work with both direct and turbo execution
    const migrationsPath = process.cwd().includes('agents-eval-api')
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
