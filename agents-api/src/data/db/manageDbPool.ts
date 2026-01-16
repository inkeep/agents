import { createAgentsManageDatabasePool } from '@inkeep/agents-core';
import { env } from '../../env';

const manageDbPool = createAgentsManageDatabasePool({
  connectionString: env.INKEEP_AGENTS_MANAGE_DATABASE_URL,
});

export default manageDbPool;
