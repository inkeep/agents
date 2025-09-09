import { createClient } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export type DatabaseClient = LibSQLDatabase<typeof schema>;

export interface DatabaseConfig {
  url: string;
  authToken?: string;
  logger?: {
    logQuery: (query: string, params: unknown[]) => void;
  };
}

/**
 * Creates a database client with the specified configuration
 */
export function createDatabaseClient(config: DatabaseConfig): DatabaseClient {
  const client = createClient({
    url: config.url,
    authToken: config.authToken,
  });

  return drizzle(client, {
    schema,
    logger: config.logger,
  });
}

/**
 * Creates an in-memory database client for testing
 */
export function createInMemoryDatabaseClient(): DatabaseClient {
  const db = createDatabaseClient({ url: ':memory:' });
  return db;
}
