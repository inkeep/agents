import { createAgentsManageDatabaseClient } from '@inkeep/agents-core';

let manageDbClient: ReturnType<typeof createAgentsManageDatabaseClient> | null = null;

export function getManageDbClient() {
  if (!manageDbClient) {
    const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
    if (!connectionString) {
      throw new Error('INKEEP_AGENTS_MANAGE_DATABASE_URL environment variable is required');
    }
    manageDbClient = createAgentsManageDatabaseClient({ connectionString });
  }
  return manageDbClient;
}

export default getManageDbClient();
