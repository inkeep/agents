import type { AgentsManageDatabaseClient } from '@inkeep/agents-core';
import {
  createBranch,
  createConversation,
  generateId,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('ImprovementService');

const UNIFIED_PROJECT_ID = 'chat-to-edit';

export interface PrepareImprovementParams {
  tenantId: string;
  projectId: string;
  agentId?: string;
  feedbackIds: string[];
  additionalContext?: string;
  db: AgentsManageDatabaseClient;
}

export interface PrepareImprovementResult {
  branchName: string;
  conversationId: string;
  chatPayload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: boolean;
    conversationId: string;
    headers: Record<string, string>;
  };
  targetHeaders: Record<string, string>;
}

export async function prepareImprovement(
  params: PrepareImprovementParams
): Promise<PrepareImprovementResult> {
  const { tenantId, projectId, agentId, feedbackIds, additionalContext, db } = params;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = agentId ?? 'project';
  const sep = id.includes('_') ? '/' : '_';
  const branchName = `improvement${sep}${id}${sep}${timestamp}`;
  const conversationId = generateId();

  logger.info({ tenantId, projectId, agentId, branchName }, 'Preparing improvement trigger');

  await createBranch(db)({ tenantId, projectId, name: branchName, fromBranch: 'main' });
  logger.info({ branchName }, 'Improvement branch created');

  const userMessage = [
    `Improvement branch: "${branchName}" (already created from main).`,
    `Feedback IDs: ${feedbackIds.join(', ')}`,
    additionalContext ? `\nAdditional context from the builder:\n${additionalContext}` : '',
  ].join('\n');

  await createConversation(runDbClient)({
    id: conversationId,
    tenantId,
    projectId: UNIFIED_PROJECT_ID,
    activeSubAgentId: 'improvement-orchestrator',
    metadata: { improvementBranch: branchName, userMessage } as Record<string, unknown>,
    ref: { type: 'branch', name: 'main', hash: '' },
  });

  return {
    branchName,
    conversationId,
    chatPayload: {
      model: `${UNIFIED_PROJECT_ID}/improvement-orchestrator`,
      messages: [{ role: 'user', content: userMessage }],
      stream: false,
      conversationId,
      headers: {
        'x-target-tenant-id': tenantId,
        'x-target-project-id': projectId,
        ...(agentId && { 'x-target-agent-id': agentId }),
        'x-target-branch-name': branchName,
      },
    },
    targetHeaders: {
      'x-target-tenant-id': tenantId,
      'x-target-project-id': projectId,
      ...(agentId && { 'x-target-agent-id': agentId }),
      'x-target-branch-name': branchName,
      'x-inkeep-agent-id': 'improvement-orchestrator',
      'x-emit-operations': 'true',
    },
  };
}
