/**
 * Workflow for running dataset items through the chat API.
 *
 * This makes dataset run processing fire-and-forget - each item is queued
 * independently and processed in parallel by the workflow system.
 */
import {
  createDatasetRunConversationRelation,
  createEvaluationResult,
  generateId,
  getConversation,
  getEvaluatorById,
  getProjectScopedRef,
  resolveRef,
  updateEvaluationResult,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../../data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { EvaluationService } from '../../services/EvaluationService';

const logger = getLogger('workflow-run-dataset-item');

type RunDatasetItemPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetItemId: string;
  datasetItemInput: unknown;
  datasetItemExpectedOutput?: unknown;
  datasetItemSimulationAgent?: {
    prompt: string;
    model: { model: string; providerOptions?: Record<string, unknown> };
    stopWhen?: { transferCountIs?: number; stepCountIs?: number };
  };
  datasetRunId: string;
  // Optional: evaluator IDs to run after conversation completes
  evaluatorIds?: string[];
  evaluationRunId?: string;
};

/**
 * Step: Call the chat API to process the dataset item
 */
async function callChatApiStep(payload: RunDatasetItemPayload) {
  'use step';

  const {
    tenantId,
    projectId,
    agentId,
    datasetItemId,
    datasetItemInput,
    datasetItemSimulationAgent,
    datasetRunId,
  } = payload;

  const evaluationService = new EvaluationService();

  // Reconstruct dataset item shape for the service
  const datasetItem = {
    id: datasetItemId,
    input: datasetItemInput,
    simulationAgent: datasetItemSimulationAgent,
  };

  const result = await evaluationService.runDatasetItem({
    tenantId,
    projectId,
    agentId,
    datasetItem: datasetItem as any,
    datasetRunId,
  });

  logger.info(
    {
      tenantId,
      projectId,
      datasetItemId,
      datasetRunId,
      conversationId: result.conversationId,
      hasError: !!result.error,
    },
    'Chat API call completed'
  );

  return result;
}

/**
 * Step: Create conversation relation in database
 */
async function createRelationStep(payload: RunDatasetItemPayload, conversationId: string) {
  'use step';

  const { tenantId, projectId, datasetItemId, datasetRunId } = payload;
  const relationId = generateId();

  try {
    await createDatasetRunConversationRelation(runDbClient)({
      tenantId,
      projectId,
      id: relationId,
      datasetRunId,
      conversationId,
      datasetItemId,
    });

    logger.info(
      { tenantId, projectId, datasetItemId, datasetRunId, conversationId, relationId },
      'Created conversation relation'
    );

    return { relationId, success: true };
  } catch (error: any) {
    // If foreign key constraint fails, the conversation doesn't exist
    if (error?.cause?.code === '23503' || error?.code === '23503') {
      logger.warn(
        { tenantId, projectId, datasetItemId, datasetRunId, conversationId },
        'Conversation does not exist, skipping relation creation'
      );
      return { relationId: null, success: false, reason: 'conversation_not_found' };
    }
    throw error;
  }
}

/**
 * Step: Execute a single evaluator on a conversation
 */
async function executeEvaluatorStep(
  tenantId: string,
  projectId: string,
  conversationId: string,
  evaluatorId: string,
  evaluationRunId: string,
  expectedOutput?: unknown
) {
  'use step';

  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    throw new Error('Failed to resolve ref');
  }

  const evaluator = await withRef(manageDbPool, resolvedRef, (db) =>
    getEvaluatorById(db)({
      scopes: { tenantId, projectId, evaluatorId },
    })
  );

  if (!evaluator) {
    logger.warn({ evaluatorId }, 'Evaluator not found');
    return null;
  }

  // Fetch full conversation (needed for activeSubAgentId to get agent definition)
  const conversation = await getConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });

  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
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
      expectedOutput,
    });

    await updateEvaluationResult(runDbClient)({
      scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
      data: { output: output as any },
    });

    logger.info(
      { conversationId, evaluatorId: evaluator.id, resultId: evalResult.id },
      'Evaluation completed'
    );

    return evalResult.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({ error, conversationId, evaluatorId: evaluator.id }, 'Evaluation failed');

    await updateEvaluationResult(runDbClient)({
      scopes: { tenantId, projectId, evaluationResultId: evalResult.id },
      data: { output: { text: `Evaluation failed: ${errorMessage}` } as any },
    });

    return evalResult.id;
  }
}

/**
 * Step: Log workflow progress
 */
async function logStep(message: string, data: Record<string, unknown>) {
  'use step';
  logger.info(data, message);
}

/**
 * Main workflow function - processes a single dataset item through the chat API.
 * Optionally runs evaluators on the resulting conversation.
 */
async function _runDatasetItemWorkflow(payload: RunDatasetItemPayload) {
  'use workflow';

  const { datasetItemId, datasetRunId, agentId, evaluatorIds, evaluationRunId } = payload;

  await logStep('Starting dataset item processing', {
    datasetItemId,
    datasetRunId,
    agentId,
    hasEvaluators: !!(evaluatorIds && evaluatorIds.length > 0),
  });

  // Call chat API
  const result = await callChatApiStep(payload);

  // Create relation if we got a conversation
  if (result.conversationId) {
    await createRelationStep(payload, result.conversationId);

    // Run evaluations if configured
    if (evaluatorIds && evaluatorIds.length > 0 && evaluationRunId) {
      for (const evaluatorId of evaluatorIds) {
        await executeEvaluatorStep(
          payload.tenantId,
          payload.projectId,
          result.conversationId,
          evaluatorId,
          evaluationRunId,
          payload.datasetItemExpectedOutput
        );
      }
    }
  } else {
    await logStep('No conversation created', {
      datasetItemId,
      datasetRunId,
      error: result.error,
    });
  }

  return {
    success: !result.error,
    datasetItemId,
    datasetRunId,
    conversationId: result.conversationId || null,
    error: result.error || null,
  };
}

// This ID must match what workflow:build generates in .well-known/workflow/v1/flow.cjs
export const runDatasetItemWorkflow = Object.assign(_runDatasetItemWorkflow, {
  workflowId:
    'workflow//./src/domains/evals/workflow/functions/runDatasetItem//_runDatasetItemWorkflow',
});
