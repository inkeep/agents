import { createAgentsManageDatabaseClient } from '@inkeep/agents-core';
import { env } from '../../env';

// Create the database client
const manageDbClient = createAgentsManageDatabaseClient({
  connectionString: env.INKEEP_AGENTS_MANAGE_DATABASE_URL,
});
export default manageDbClient;
