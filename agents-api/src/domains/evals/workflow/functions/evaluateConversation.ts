import {
  createEvaluationResult,
  generateId,
  getAgentIdsForEvaluators,
  getConversation,
  getEvaluatorById,
  getEvaluatorsByIds,
  getProjectMainResolvedRef,
  updateEvaluationResult,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../../data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { EvaluationService } from '../../services/EvaluationService';

const logger = getLogger('workflow-evaluate-conversation');

type EvaluationPayload = {
  tenantId: string;
  projectId: string;
  conversationId: string;
  evaluatorIds: string[];
  evaluationRunId: string;
};

async function getConversationStep(payload: EvaluationPayload) {
  'use step';

  const { tenantId, projectId, conversationId } = payload;

  const conv = await getConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });

  if (!conv) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  return conv;
}

async function getEvaluatorsStep(payload: EvaluationPayload) {
  'use step';
  const { tenantId, projectId, evaluatorIds } = payload;

  const projectMain = await getProjectMainResolvedRef(manageDbClient)(tenantId, projectId);

  const evals = await withRef(manageDbPool, projectMain, (db) =>
    getEvaluatorsByIds(db)({
      scopes: { tenantId, projectId },
      evaluatorIds,
    })
  );

  return evals;
}

async function executeEvaluatorStep(
  payload: EvaluationPayload,
  evaluatorId: string,
  conversation: any
) {
  'use step';

  const { tenantId, projectId, conversationId, evaluationRunId } = payload;

  const projectMain = await getProjectMainResolvedRef(manageDbClient)(tenantId, projectId);

  const evaluator = await withRef(manageDbPool, projectMain, (db) =>
    getEvaluatorById(db)({
      scopes: { tenantId, projectId, evaluatorId },
    })
  );

  if (!evaluator) {
    throw new Error(`Evaluator not found: ${evaluatorId}`);
  }

  const evalResult = await createEvaluationResult(runDbClient)({
    id: generateId(),
    tenantId,
    projectId,
    conversationId,
    evaluatorId: evaluator.id,
    evaluationRunId,
  });

  try {
    const evaluationService = new EvaluationService();
    const output = await evaluationService.executeEvaluation({
      conversation,
      evaluator,
      tenantId,
      projectId,
    });

    const updated = await updateEvaluationResult(runDbClient)({
      scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
      data: { output: output as any },
    });

    logger.info(
      { conversationId, evaluatorId: evaluator.id, resultId: evalResult.id },
      'Evaluation completed successfully'
    );

    return updated;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      { error, conversationId, evaluatorId: evaluator.id, resultId: evalResult.id },
      'Evaluation execution failed'
    );

    const failed = await updateEvaluationResult(runDbClient)({
      scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
      data: { output: { text: `Evaluation failed: ${errorMessage}` } as any },
    });

    return failed;
  }
}

async function filterEvaluatorsByAgentStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string | null;
  evaluatorIds: string[];
}): Promise<string[]> {
  'use step';

  const { tenantId, projectId, agentId, evaluatorIds } = params;

  if (!agentId) return evaluatorIds;

  const projectMain = await getProjectMainResolvedRef(manageDbClient)(tenantId, projectId);

  const agentIdsMap = await withRef(manageDbPool, projectMain, (db) =>
    getAgentIdsForEvaluators(db)({
      scopes: { tenantId, projectId },
      evaluatorIds,
    })
  );

  const filtered = evaluatorIds.filter((evalId) => {
    const scopedAgents = agentIdsMap.get(evalId);
    if (!scopedAgents || scopedAgents.length === 0) return true;
    return scopedAgents.includes(agentId);
  });

  if (filtered.length < evaluatorIds.length) {
    logger.info(
      {
        agentId,
        originalCount: evaluatorIds.length,
        filteredCount: filtered.length,
        excluded: evaluatorIds.filter((id) => !filtered.includes(id)),
      },
      'Filtered evaluators by agent scoping in conversation evaluation'
    );
  }

  return filtered;
}

/**
 * Step: Log workflow progress
 */
async function logStep(message: string, data: Record<string, any>) {
  'use step';
  logger.info(data, message);
}

/**
 * Main workflow function - orchestrates the evaluation steps.
 *
 * IMPORTANT: This runs in a deterministic sandbox.
 * - Do NOT call Node.js APIs directly here (no DB, no fs, etc.)
 * - All side effects must happen in step functions
 */
async function _evaluateConversationWorkflow(payload: EvaluationPayload) {
  'use workflow';

  const { tenantId, projectId, conversationId, evaluatorIds } = payload;

  await logStep('Starting conversation evaluation', payload);

  const conversation = await getConversationStep(payload);

  const filteredEvaluatorIds = await filterEvaluatorsByAgentStep({
    tenantId,
    projectId,
    agentId: conversation.agentId,
    evaluatorIds,
  });

  if (filteredEvaluatorIds.length === 0) {
    await logStep('No evaluators applicable after agent scoping', {
      conversationId,
      evaluatorIds,
      agentId: conversation.agentId,
    });
    return { success: true, conversationId, resultCount: 0 };
  }

  const filteredPayload = { ...payload, evaluatorIds: filteredEvaluatorIds };
  const evaluators = await getEvaluatorsStep(filteredPayload);

  if (evaluators.length === 0) {
    await logStep('No valid evaluators found', {
      conversationId,
      evaluatorIds: filteredEvaluatorIds,
    });
    return { success: false, reason: 'No valid evaluators' };
  }

  const results: any[] = [];
  for (const evaluator of evaluators) {
    const result = await executeEvaluatorStep(payload, evaluator.id, conversation);
    results.push(result);
  }

  return {
    success: true,
    conversationId,
    resultCount: results.length,
  };
}

// This ID must match what workflow:build generates in .well-known/workflow/v1/flow.cjs
export const evaluateConversationWorkflow = Object.assign(_evaluateConversationWorkflow, {
  workflowId:
    'workflow//./src/domains/evals/workflow/functions/evaluateConversation//_evaluateConversationWorkflow',
});
