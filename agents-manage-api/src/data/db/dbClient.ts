import { createDatabaseClient } from '@inkeep/agents-core';
import { env } from '../../env.js';

// Create database URL - use in-memory for tests, file for other environments
const getDbUrl = () => {
  // Use in-memory database for tests - each worker gets its own isolated database
  if (env.ENVIRONMENT === 'test') {
    return ':memory:';
  }

  return env.DB_FILE_NAME;
};

// Create the SQLite client
const dbClient = createDatabaseClient({ url: getDbUrl() });
export default dbClient;
