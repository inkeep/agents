import { createDatabaseClient } from '@inkeep/agents-core';
import { env } from '../../env';

// Create database URL - use in-memory for tests, Turso if available, else file
const getDbConfig = () => {
  // Use in-memory database for tests - each worker gets its own isolated database
  if (env.ENVIRONMENT === 'test') {
    return { url: ':memory:' };
  }

  // Prefer Turso if both URL + token are set
  if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    return {
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    };
  }

  if (!env.DB_FILE_NAME) {
    throw new Error(
      'Database configuration error: DB_FILE_NAME must be set if Turso is not configured.'
    );
  }

  // Otherwise, fallback to file (must be explicitly set)
  return {
    url: env.DB_FILE_NAME,
  };
};

// Create the database client
const dbClient = createDatabaseClient(getDbConfig());
export default dbClient;
