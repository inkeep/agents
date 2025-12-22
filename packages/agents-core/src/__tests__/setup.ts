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

beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    testManageDbClient = await createTestManageDatabaseClient(DRIZZLE_MANAGE_DIR);
    testRunDbClient = await createTestRuntimeDatabaseClient(DRIZZLE_RUNTIME_DIR);

    logger.debug({}, 'Database migrations applied successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to apply database migrations');
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
