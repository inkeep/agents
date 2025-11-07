import { createDatabaseClient } from '@inkeep/agents-core';
import { env } from '../../env';

// Create database URL - use in-memory for tests
const getDbConfig = () => {
  if (env.ENVIRONMENT === 'test') {
    return {};
  }
  return { connectionString: env.DATABASE_URL };
};

// Create the database client
const dbClient = createDatabaseClient(getDbConfig());
export default dbClient;
