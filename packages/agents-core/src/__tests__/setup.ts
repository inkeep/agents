import path from 'node:path';
import { afterEach, beforeAll } from 'vitest';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import {
  cleanupTestManageDatabase,
  createTestManageDatabaseClient,
} from '../db/manage/test-manage-client';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import {
  cleanupTestRuntimeDatabase,
  createTestRuntimeDatabaseClient,
} from '../db/runtime/test-runtime-client';
import { getLogger } from '../utils/logger';

const DRIZZLE_MANAGE_DIR = path.resolve(import.meta.dirname, '../../drizzle/manage');
const DRIZZLE_RUNTIME_DIR = path.resolve(import.meta.dirname, '../../drizzle/runtime');

let testManageDbClient: AgentsManageDatabaseClient;
let testRunDbClient: AgentsRunDatabaseClient;

// Initialize database schema for in-memory test databases
// If pre-compiled snapshots exist at test-fixtures/*.tar.gz, they will be loaded automatically
// instead of running migrations, significantly speeding up test initialization.
// Run `pnpm test:generate-snapshot` to regenerate snapshots after schema changes.
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Initializing in-memory test databases (using snapshot if available)');

    testManageDbClient = await createTestManageDatabaseClient(DRIZZLE_MANAGE_DIR);
    testRunDbClient = await createTestRuntimeDatabaseClient(DRIZZLE_RUNTIME_DIR);

    logger.debug({}, 'Test databases initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize test databases');
    throw error;
  }
}, 60000);

afterEach(async () => {
  if (testManageDbClient) {
    await cleanupTestManageDatabase(testManageDbClient);
  }
  if (testRunDbClient) {
    await cleanupTestRuntimeDatabase(testRunDbClient);
  }
});

export { testManageDbClient, testRunDbClient };
