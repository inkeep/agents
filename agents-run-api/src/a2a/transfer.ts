import { executeInBranch, type ResolvedRef, setActiveAgentForThread } from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('Transfer');
/**
 * Executes a transfer by sending the original message to the target agent
 */
export async function executeTransfer({
  tenantId,
  threadId,
  projectId,
  targetSubAgentId,
  ref,
}: {
  tenantId: string;
  threadId: string;
  projectId: string;
  targetSubAgentId: string;
  ref: ResolvedRef;
}): Promise<{
  success: boolean;
  targetSubAgentId: string;
}> {
  logger.info(
    {
      targetAgent: targetSubAgentId,
      threadId,
      tenantId,
      projectId,
    },
    'Executing transfer - calling setActiveAgentForThread'
  );

  try {
    await executeInBranch(
      {
        dbClient,
        ref,
        autoCommit: true,
        commitMessage: 'Update active agent for thread',
      },
      async (db) => {
        await setActiveAgentForThread(db)({
          scopes: { tenantId, projectId },
          threadId,
          subAgentId: targetSubAgentId,
        });
      }
    );

    logger.info(
      { targetAgent: targetSubAgentId, threadId },
      'Successfully updated active_sub_agent_id in database'
    );
  } catch (error) {
    logger.error(
      { error, targetAgent: targetSubAgentId, threadId },
      'Failed to update active_sub_agent_id'
    );
    throw error;
  }

  return { success: true, targetSubAgentId };
}

/**
 * Checks if a response is a transfer response
 * Re-exported from types.ts for backward compatibility
 */
export { extractTransferData, isTransferTask as isTransferResponse } from './types';
