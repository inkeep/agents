import type { EvaluationJobFilterCriteria, ResolvedRef } from '@inkeep/agents-core';
import { createEvaluationRun, filterConversationsForJob, generateId } from '@inkeep/agents-core';
import { start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { evaluateConversationWorkflow } from '../workflow';

const logger = getLogger('evaluation-job');

export async function queueEvaluationJobConversations(params: {
  tenantId: string;
  projectId: string;
  evaluationJobConfigId: string;
  evaluatorIds: string[];
  jobFilters: EvaluationJobFilterCriteria | null | undefined;
  resolvedRef?: ResolvedRef;
}): Promise<{
  conversationCount: number;
  queued: number;
  failed: number;
  evaluationRunId: string;
}> {
  const { tenantId, projectId, evaluationJobConfigId, evaluatorIds, jobFilters, resolvedRef } =
    params;

  const conversations = await filterConversationsForJob(runDbClient)({
    scopes: { tenantId, projectId },
    jobFilters,
  });

  if (conversations.length === 0) {
    logger.warn({ tenantId, projectId, evaluationJobConfigId }, 'No conversations found for job');
    return { conversationCount: 0, queued: 0, failed: 0, evaluationRunId: '' };
  }

  const evaluationRun = await createEvaluationRun(runDbClient)({
    id: generateId(),
    tenantId,
    projectId,
    evaluationJobConfigId,
    ref: resolvedRef,
  });

  let queued = 0;
  let failed = 0;

  for (const conv of conversations) {
    try {
      await start(evaluateConversationWorkflow, [
        {
          tenantId,
          projectId,
          conversationId: conv.id,
          evaluatorIds,
          evaluationRunId: evaluationRun.id,
        },
      ]);
      queued++;
    } catch (err) {
      logger.error({ err, conversationId: conv.id }, 'Failed to queue conversation evaluation');
      failed++;
    }
  }

  return {
    conversationCount: conversations.length,
    queued,
    failed,
    evaluationRunId: evaluationRun.id,
  };
}
