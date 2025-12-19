import { PGlite } from '@electric-sql/pglite';
import { createDatabaseClient, type DatabaseClient } from '@inkeep/agents-core';
import * as schema from '@inkeep/agents-core/db/schema';
import { drizzle } from 'drizzle-orm/pglite';
import { env } from '../../env';

// Create the database client
// For test environment, create a PGlite in-memory database (migrations applied in setup.ts)
// For other environments, use PostgreSQL with connection pooling
let dbClient: DatabaseClient;

if (env.ENVIRONMENT === 'test') {
  // Create in-memory PGlite database for tests
  // Migrations will be applied by the test setup file
  const pglite = new PGlite();
  dbClient = drizzle({ client: pglite, schema });
} else {
  dbClient = createDatabaseClient({ connectionString: env.DATABASE_URL });
}

export default dbClient;
