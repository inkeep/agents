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

export function createAgentsManageDatabasePool(config: AgentsManageDatabaseConfig): Pool {
  const connectionString = config.connectionString || env.INKEEP_AGENTS_MANAGE_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'INKEEP_AGENTS_MANAGE_DATABASE_URL environment variable is required. Please set it to your PostgreSQL connection string.'
    );
  }

  const pool = new Pool({
    connectionString,
    max: config.poolSize || Number(env.POSTGRES_POOL_SIZE) || 100,
    keepAlive: true,
    keepAliveInitialDelayMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  return pool;
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
    max: config.poolSize || Number(env.POSTGRES_POOL_SIZE) || 100,
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
    logger: config.logger,
  });
}

export function createAgentManageDatabaseConnection(config: AgentsManageDatabaseConfig): Promise<{
  db: AgentsManageDatabaseClient;
  release: () => Promise<void>;
}> {
  const connectionString = config.connectionString || env.INKEEP_AGENTS_MANAGE_DATABASE_URL;

  if (env.ENVIRONMENT === 'test') {
    throw new Error('createAgentManageDatabaseConnection is not supported in test environment');
  }

  if (!connectionString) {
    throw new Error(
      'INKEEP_AGENTS_MANAGE_DATABASE_URL environment variable is required. Please set it to your PostgreSQL connection string.'
    );
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    keepAlive: true,
    keepAliveInitialDelayMillis: 60_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  return pool.connect().then((connection) => {
    const db = drizzle(connection, { schema, logger: config.logger });

    const release = async () => {
      connection.release();
      await pool.end();
    };

    return { db, release };
  });
}
