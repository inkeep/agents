import { createAgentsManageDatabaseClient } from '@inkeep/agents-core';
import { env } from '../../env';

const manageDbClient = createAgentsManageDatabaseClient({
  connectionString: env.INKEEP_AGENTS_MANAGE_DATABASE_URL,
});

export default manageDbClient;
