import { getLogger } from '@inkeep/agents-core';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll } from 'vitest';
import dbClient from '../data/db/dbClient';
import runDbClient from '../data/db/runDbClient';

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    // Use path relative to project root to work with both direct and turbo execution
    // When running from agents-manage-api, go up one level to project root
    const isInPackageDir =
      process.cwd().includes('agents-manage-api') || process.cwd().includes('agents-run-api');
    const manageMigrationsPath = isInPackageDir
      ? '../packages/agents-core/drizzle/manage'
      : './packages/agents-core/drizzle/manage';

    const runMigrationsPath = isInPackageDir
      ? '../packages/agents-core/drizzle/runtime'
      : './packages/agents-core/drizzle/runtime';

    await migrate(dbClient, { migrationsFolder: manageMigrationsPath });
    await migrate(runDbClient, { migrationsFolder: runMigrationsPath });
    logger.debug({}, 'Database migrations applied successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to apply database migrations');
    throw error;
  }
}, 60000);

afterEach(() => {
  // Any cleanup if needed
});

afterAll(() => {
  // Any final cleanup if needed
});
