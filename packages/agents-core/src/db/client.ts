import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { env, loadEnvironmentFiles } from '../env';
import * as schema from './schema';
import { createTestDatabaseClientNoMigrations } from './test-client';

loadEnvironmentFiles();

// Union type that accepts both production (node-postgres) and test (PGlite) clients
export type DatabaseClient = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export interface DatabaseConfig {
  connectionString?: string;
  poolSize?: number;
  ssl?: boolean;
  logger?: {
    logQuery: (query: string, params: unknown[]) => void;
  };
  ref?: string;
}

/**
 * Appends a ref (branch, tag, or commit) to a database connection URL
 * Handles URLs with query parameters (e.g., from Neon, Supabase)
 * Example: postgresql://host/dbname?ssl=true -> postgresql://host/dbname/branch?ssl=true
 */
function appendRefToConnectionUrl(connectionString: string, ref: string): string {
  const url = new URL(connectionString);
  const pathParts = url.pathname.split('/').filter(Boolean);

  pathParts.push(ref);
  url.pathname = `/${pathParts.join('/')}`;

  return url.toString();
}

/**
 * Creates a PostgreSQL database client with connection pooling
 */
export function createDatabaseClient(config: DatabaseConfig = {}): DatabaseClient {
  let connectionString = config.connectionString || process.env.DATABASE_URL;

  if (env.ENVIRONMENT === 'test') {
    return createTestDatabaseClientNoMigrations();
  }

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required. Please set it to your PostgreSQL connection string.'
    );
  }

  if (config.ref) {
    connectionString = appendRefToConnectionUrl(connectionString, config.ref);
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
