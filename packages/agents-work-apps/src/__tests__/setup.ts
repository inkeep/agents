import { getLogger } from '@inkeep/agents-core';
import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import runDbClient from '../db/runDbClient';

// Mock the local logger module globally - this will be hoisted automatically by Vitest
vi.mock('../logger.js', () => createMockLoggerModule().module);
vi.mock('../logger', () => createMockLoggerModule().module);

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug('Applying database migrations to in-memory test database');

    const runMigrationsPath = '../agents-core/drizzle/runtime';

    await migrate(runDbClient as unknown as Parameters<typeof migrate>[0], {
      migrationsFolder: runMigrationsPath,
    });
    logger.debug('Database migrations applied successfully');
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
