import { createAgentsRunDatabaseClient } from '@inkeep/agents-core';
import { env } from '../env';

const runDbClient = createAgentsRunDatabaseClient({
  connectionString: env.INKEEP_AGENTS_RUN_DATABASE_URL,
});

export default runDbClient;
