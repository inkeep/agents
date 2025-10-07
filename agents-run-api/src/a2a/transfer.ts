import { setActiveAgentForThread } from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import type { TransferResponse } from './types';

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
    agentId: targetSubAgentId,
  });
  return { success: true, targetSubAgentId };
}

/**
 * Checks if a response is a transfer response
 */
export function isTransferResponse(result: any): result is TransferResponse {
  return result?.artifacts.some((artifact: any) =>
    artifact.parts.some((part: any) => part.kind === 'data' && part.data?.type === 'transfer')
  );
}
