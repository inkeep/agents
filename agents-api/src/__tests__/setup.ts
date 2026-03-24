import { getLogger } from '@inkeep/agents-core';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import manageDbClient from '../data/db/manageDbClient';
import runDbClient from '../data/db/runDbClient';

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

// Mock only the manageDbPool module to avoid creating a real PostgreSQL pool during tests
// This is necessary because manageDbPool.ts calls createAgentsManageDatabasePool at import time
vi.mock('../data/db/manageDbPool', () => {
  return {
    default: {
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    },
  };
});

// Also mock with src/ path since some files use that import style
vi.mock('src/data/db/manageDbPool', () => {
  return {
    default: {
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    },
  };
});

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    // Use path relative to project root to work with both direct and turbo execution
    // When running from agents-api, go up one level to project root
    const isInPackageDir = process.cwd().includes('agents-api');
    const manageMigrationsPath = isInPackageDir
      ? '../packages/agents-core/drizzle/manage'
      : './packages/agents-core/drizzle/manage';

    const runMigrationsPath = isInPackageDir
      ? '../packages/agents-core/drizzle/runtime'
      : './packages/agents-core/drizzle/runtime';

    await migrate(manageDbClient as unknown as Parameters<typeof migrate>[0], {
      migrationsFolder: manageMigrationsPath,
    });
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
