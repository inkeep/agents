import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { Pool, types } from 'pg';
import { env, loadEnvironmentFiles } from '../../env';
import * as schema from './manage-schema';
import { createTestManageDatabaseClientNoMigrations } from './test-manage-client';

loadEnvironmentFiles();

/**
 * Register binary format type parsers for PostgreSQL timestamp types.
 *
 * Doltgres has a bug where it returns RowDescription fields with binary format
 * code (1) for timestamp columns when the extended query protocol is used
 * (which Drizzle forces via named prepared statements). Without these parsers,
 * the raw 8-byte binary data passes through as garbage strings.
 *
 * Binary TIMESTAMP format: signed int64 microseconds since 2000-01-01 00:00:00 UTC.
 */
const PG_EPOCH_MS = 946684800000;
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;

function decodeBinaryTimestamp(buf: Buffer): string {
  const microseconds = buf.readBigInt64BE(0);
  const ms = Number(microseconds / 1000n) + PG_EPOCH_MS;
  const iso = new Date(ms).toISOString();
  return iso.replace('T', ' ').replace('Z', '');
}

function decodeBinaryTimestampTz(buf: Buffer): string {
  const microseconds = buf.readBigInt64BE(0);
  const ms = Number(microseconds / 1000n) + PG_EPOCH_MS;
  return new Date(ms).toISOString();
}

// pg's TypeScript definitions don't include the binary format overload, but it's supported at runtime
(types.setTypeParser as Function)(TIMESTAMP_OID, 'binary', decodeBinaryTimestamp);
(types.setTypeParser as Function)(TIMESTAMPTZ_OID, 'binary', decodeBinaryTimestampTz);

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
