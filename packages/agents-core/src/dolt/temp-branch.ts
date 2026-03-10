import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { doltBranch } from './branch';

export const createTempBranchFromCommit =
  (db: AgentsManageDatabaseClient) =>
  async (params: { name: string; commitHash: string }): Promise<void> => {
    await doltBranch(db)({ name: params.name, startPoint: params.commitHash });
  };
