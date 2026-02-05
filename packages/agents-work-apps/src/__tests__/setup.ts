import { getLogger } from '@inkeep/agents-core';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import runDbClient from '../db/runDbClient';

// Mock the local logger module globally - this will be hoisted automatically by Vitest
vi.mock('../logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    getPinoInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
    withRequestContext: vi.fn(async (_id, fn) => await fn()),
  };
});

vi.mock('../logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    getPinoInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
    withRequestContext: vi.fn(async (_id, fn) => await fn()),
  };
});

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    const runMigrationsPath = '../agents-core/drizzle/runtime';

    await migrate(runDbClient as unknown as Parameters<typeof migrate>[0], {
      migrationsFolder: runMigrationsPath,
    });
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
