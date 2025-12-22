import { createAgentsRunDatabaseClient } from '@inkeep/agents-core';
import { env } from '../../env';

// Create the database client
const dbClient = createAgentsRunDatabaseClient({
  connectionString: env.INKEEP_AGENTS_RUN_DATABASE_URL,
});
export default dbClient;
