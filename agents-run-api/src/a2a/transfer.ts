import { setActiveAgentForThread } from '@inkeep/agents-core';
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
}: {
  tenantId: string;
  threadId: string;
  projectId: string;
  targetSubAgentId: string;
}): Promise<{
  success: boolean;
  targetSubAgentId: string;
}> {
  logger.info({ targetAgent: targetSubAgentId }, 'Executing transfer to agent');
  await setActiveAgentForThread(dbClient)({
    scopes: { tenantId, projectId },
    threadId,
    subAgentId: targetSubAgentId,
  });
  return { success: true, targetSubAgentId };
}

/**
 * Checks if a response is a transfer response
 * Re-exported from types.ts for backward compatibility
 */
export { isTransferTask as isTransferResponse, extractTransferData } from './types';
