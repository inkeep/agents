import { afterEach, beforeAll } from 'vitest';
import type { DatabaseClient } from '../db/client';
import { cleanupTestDatabase, createTestDatabaseClient } from '../db/test-client';
import { getLogger } from '../utils/logger';

let testDbClient: DatabaseClient;

beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    testDbClient = await createTestDatabaseClient();

    logger.debug({}, 'Database migrations applied successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to apply database migrations');
    throw error;
  }
}, 60000);

afterEach(async () => {
  if (testDbClient) {
    await cleanupTestDatabase(testDbClient);
  }
});

export { testDbClient };
