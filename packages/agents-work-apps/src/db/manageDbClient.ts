import { createAgentsManageDatabaseClient } from '@inkeep/agents-core';
import { env } from '../env';

if (!env.INKEEP_AGENTS_MANAGE_DATABASE_URL) {
  throw new Error('INKEEP_AGENTS_MANAGE_DATABASE_URL is required for work-apps manage DB access');
}

const manageDbClient = createAgentsManageDatabaseClient({
  connectionString: env.INKEEP_AGENTS_MANAGE_DATABASE_URL,
});

export default manageDbClient;
