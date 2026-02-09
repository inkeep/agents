import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { env, loadEnvironmentFiles } from '../../env';
import * as schema from './runtime-schema';
import { createTestRuntimeDatabaseClientNoMigrations } from './test-runtime-client';

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
export function createAgentsRunDatabaseClient(
  config?: AgentsRunDatabaseConfig
): AgentsRunDatabaseClient {
  const connectionString = config?.connectionString || env.INKEEP_AGENTS_RUN_DATABASE_URL;

  if (env.ENVIRONMENT === 'test') {
    return createTestRuntimeDatabaseClientNoMigrations();
  }

  if (!connectionString) {
    throw new Error(
      'INKEEP_AGENTS_RUN_DATABASE_URL environment variable is required. Please set it to your PostgreSQL connection string.'
    );
  }

  const pool = new Pool({
    connectionString,
    max: config?.poolSize || Number(env.POSTGRES_POOL_SIZE) || 100,
    keepAlive: true,
    keepAliveInitialDelayMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  return drizzle(pool, {
    schema,
    logger: config?.logger,
  });
}
