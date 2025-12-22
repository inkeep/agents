import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { env, loadEnvironmentFiles } from '../../env';
import * as schema from './manage-schema';
import { createTestManageDatabaseClientNoMigrations } from './test-manage-client';

loadEnvironmentFiles();

// Union type that accepts both production (node-postgres) and test (PGlite) clients
export type AgentsManageDatabaseClient =
  | NodePgDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export interface AgentsManageDatabaseConfig {
  connectionString?: string;
  poolSize?: number;
  ssl?: boolean;
  logger?: {
    logQuery: (query: string, params: unknown[]) => void;
  };
}

/**
 * Creates a PostgreSQL database client with connection pooling
 */
export function createAgentsManageDatabaseClient(
  config: AgentsManageDatabaseConfig
): AgentsManageDatabaseClient {
  const connectionString = config.connectionString || env.INKEEP_AGENTS_MANAGE_DATABASE_URL;

  if (env.ENVIRONMENT === 'test') {
    return createTestManageDatabaseClientNoMigrations();
  }

  if (!connectionString) {
    throw new Error(
      'INKEEP_AGENTS_MANAGE_DATABASE_URL environment variable is required. Please set it to your PostgreSQL connection string.'
    );
  }

  const pool = new Pool({
    connectionString,
    max: config.poolSize || Number(env.POSTGRES_POOL_SIZE) || 10,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  return drizzle(pool, {
    schema,
    logger: config.logger,
  });
}
