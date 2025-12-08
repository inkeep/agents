import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { env, loadEnvironmentFiles } from '../../env';
import { createTestRuntimeDatabaseClientNoMigrations } from './test-runtime-client';
import * as schema from './runtime-schema';

loadEnvironmentFiles();

// Union type that accepts both production (node-postgres) and test (PGlite) clients
export type AgentsRunDatabaseClient = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export interface AgentsRunDatabaseConfig {
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
export function createAgentsRunDatabaseClient(config: AgentsRunDatabaseConfig): AgentsRunDatabaseClient {
  let connectionString = config.connectionString || process.env.AGENTS_RUN_DATABASE_URL;

  if (env.ENVIRONMENT === 'test') {
    return createTestRuntimeDatabaseClientNoMigrations();
  }

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required. Please set it to your PostgreSQL connection string.'
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
