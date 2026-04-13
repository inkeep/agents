import type { ResolvedRef } from '@inkeep/agents-core';
import {
  createBranch,
  createConversation,
  generateId,
  getInProcessFetch,
  getWaitUntil,
  updateConversation,
  withRef,
} from '@inkeep/agents-core';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('ImprovementService');

const IMPROVEMENT_PROJECT_ID = 'improvement-agent';

export interface TriggerImprovementParams {
  tenantId: string;
  projectId: string;
  agentId?: string;
  feedbackIds: string[];
  additionalContext?: string;
  resolvedRef: ResolvedRef;
}

export interface TriggerImprovementResult {
  branchName: string;
  conversationId: string;
}

export async function triggerImprovement(
  params: TriggerImprovementParams
): Promise<TriggerImprovementResult> {
  const { tenantId, projectId, agentId, feedbackIds, additionalContext, resolvedRef } = params;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const branchName = `improvement/${agentId ?? 'project'}/${timestamp}`;
  const conversationId = generateId();

  logger.info({ tenantId, projectId, agentId, branchName }, 'Creating improvement branch');

  await withRef(manageDbPool, resolvedRef, async (db) => {
    await createBranch(db)({
      tenantId,
      projectId,
      name: branchName,
      fromBranch: 'main',
    });
  });

  logger.info({ branchName }, 'Improvement branch created, triggering agent via chat API');

  const userMessage = [
    `Improvement branch "${branchName}" is ready. Feedback IDs: ${feedbackIds.join(', ')}`,
    additionalContext ? `\nAdditional context from the builder:\n${additionalContext}` : '',
  ].join('\n');

  await createConversation(runDbClient)({
    id: conversationId,
    tenantId,
    projectId: IMPROVEMENT_PROJECT_ID,
    activeSubAgentId: 'improvement-orchestrator',
    metadata: { improvementBranch: branchName, status: 'running', userMessage },
  });

  const baseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const apiKey = env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '';

  const chatPayload = {
    model: `${IMPROVEMENT_PROJECT_ID}/improvement-orchestrator`,
    messages: [{ role: 'user', content: userMessage }],
    stream: false,
    conversationId,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'x-inkeep-tenant-id': tenantId,
    'x-inkeep-project-id': IMPROVEMENT_PROJECT_ID,
    'x-inkeep-agent-id': 'improvement-orchestrator',
    'x-target-tenant-id': tenantId,
    'x-target-project-id': projectId,
    'x-target-branch-name': branchName,
    'x-emit-operations': 'true',
    ...(agentId && { 'x-target-agent-id': agentId }),
  };

  const inProcessFetch = getInProcessFetch();

  const scopes = { tenantId, projectId: IMPROVEMENT_PROJECT_ID };

  const promise = inProcessFetch(`${baseUrl}/run/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(chatPayload),
  }).then(async (res) => {
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      logger.error(
        { status: res.status, body, branchName, conversationId },
        'Improvement chat API call failed'
      );
      await updateConversation(runDbClient)({
        scopes,
        conversationId,
        data: { metadata: { improvementBranch: branchName, status: 'failed' } },
      }).catch(() => {});
    } else {
      logger.info({ branchName, conversationId }, 'Improvement agent execution completed');
      await updateConversation(runDbClient)({
        scopes,
        conversationId,
        data: { metadata: { improvementBranch: branchName, status: 'completed' } },
      }).catch(() => {});
    }
  }).catch(async (err) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), branchName },
      'Improvement chat API call errored'
    );
    await updateConversation(runDbClient)({
      scopes,
      conversationId,
      data: { metadata: { improvementBranch: branchName, status: 'failed' } },
    }).catch(() => {});
  });

  const waitUntil = await getWaitUntil();
  if (waitUntil) {
    waitUntil(promise);
  }

  return { branchName, conversationId };
}
