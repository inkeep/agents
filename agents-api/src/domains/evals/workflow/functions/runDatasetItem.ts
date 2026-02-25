/**
 * Workflow for running dataset items via direct agent execution.
 *
 * Each item is queued independently and processed in parallel by the workflow
 * system. Execution reuses executeScheduledTriggerStep from the scheduled
 * trigger infrastructure — a dataset item run IS a trigger invocation.
 */
import type { DatasetItemInput } from '@inkeep/agents-core';
import {
  addConversationIdToInvocation,
  createDatasetRunConversationRelation,
  createEvaluationResult,
  generateId,
  getConversation,
  getEvaluatorById,
  getProjectScopedRef,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  resolveRef,
  updateEvaluationResult,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../../data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { executeScheduledTriggerStep } from '../../../run/workflow/steps/scheduledTriggerSteps';
import { EvaluationService } from '../../services/EvaluationService';

const logger = getLogger('workflow-run-dataset-item');

type RunDatasetItemPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetItemId: string;
  datasetItemInput: DatasetItemInput;
  datasetItemExpectedOutput?: unknown;
  datasetRunId: string;
  scheduledTriggerInvocationId: string;
  evaluatorIds?: string[];
  evaluationRunId?: string;
  timeoutSeconds?: number;
};

/**
 * Step: Execute the dataset item via the shared scheduled trigger step
 */
async function executeDatasetItemStep(payload: RunDatasetItemPayload) {
  'use step';

  const { tenantId, projectId, agentId, datasetItemInput, datasetRunId, scheduledTriggerInvocationId, timeoutSeconds } =
    payload;

  return executeScheduledTriggerStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId: datasetRunId,
    invocationId: scheduledTriggerInvocationId,
    timeoutSeconds: timeoutSeconds ?? 300,
    messages: datasetItemInput.messages,
    datasetRunId,
  });
}

/**
 * Step: Record conversation relation and track on invocation
 */
async function recordConversationStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetRunId: string;
  datasetItemId: string;
  conversationId: string;
  scheduledTriggerInvocationId: string;
}) {
  'use step';

  const {
    tenantId,
    projectId,
    agentId,
    datasetRunId,
    datasetItemId,
    conversationId,
    scheduledTriggerInvocationId,
  } = params;

  await Promise.all([
    createDatasetRunConversationRelation(runDbClient)({
      tenantId,
      projectId,
      id: generateId(),
      datasetRunId,
      conversationId,
      datasetItemId,
    }),
    addConversationIdToInvocation(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: datasetRunId,
      invocationId: scheduledTriggerInvocationId,
      conversationId,
    }),
  ]);
}

/**
 * Step: Mark invocation as completed
 */
async function markCompletedStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetRunId: string;
  scheduledTriggerInvocationId: string;
}) {
  'use step';

  await markScheduledTriggerInvocationCompleted(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.datasetRunId,
    invocationId: params.scheduledTriggerInvocationId,
  });
}

/**
 * Step: Mark invocation as failed
 */
async function markFailedStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetRunId: string;
  scheduledTriggerInvocationId: string;
}) {
  'use step';

  await markScheduledTriggerInvocationFailed(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.datasetRunId,
    invocationId: params.scheduledTriggerInvocationId,
  });
}

/**
 * Step: Mark invocation as running
 */
async function markRunningStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetRunId: string;
  scheduledTriggerInvocationId: string;
}) {
  'use step';

  await markScheduledTriggerInvocationRunning(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.datasetRunId,
    invocationId: params.scheduledTriggerInvocationId,
  });
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
 * Main workflow function - processes a single dataset item.
 * Uses executeScheduledTriggerStep for agent execution (same path as scheduled triggers).
 * Optionally runs evaluators on the resulting conversation.
 */
async function _runDatasetItemWorkflow(payload: RunDatasetItemPayload) {
  'use workflow';

  const {
    tenantId,
    projectId,
    agentId,
    datasetItemId,
    datasetRunId,
    scheduledTriggerInvocationId,
    evaluatorIds,
    evaluationRunId,
  } = payload;

  await logStep('Starting dataset item processing', {
    datasetItemId,
    datasetRunId,
    agentId,
    hasEvaluators: !!(evaluatorIds && evaluatorIds.length > 0),
  });

  await markRunningStep({
    tenantId,
    projectId,
    agentId,
    datasetRunId,
    scheduledTriggerInvocationId,
  });

  const result = await executeDatasetItemStep(payload);

  if (result.success && result.conversationId) {
    await recordConversationStep({
      tenantId,
      projectId,
      agentId,
      datasetRunId,
      datasetItemId,
      conversationId: result.conversationId,
      scheduledTriggerInvocationId,
    });

    await markCompletedStep({
      tenantId,
      projectId,
      agentId,
      datasetRunId,
      scheduledTriggerInvocationId,
    });

    if (evaluatorIds && evaluatorIds.length > 0 && evaluationRunId) {
      for (const evaluatorId of evaluatorIds) {
        await executeEvaluatorStep(
          tenantId,
          projectId,
          result.conversationId,
          evaluatorId,
          evaluationRunId,
          payload.datasetItemExpectedOutput
        );
      }
    }
  } else {
    await logStep('Dataset item execution failed or no conversation created', {
      datasetItemId,
      datasetRunId,
      error: result.error,
    });

    await markFailedStep({
      tenantId,
      projectId,
      agentId,
      datasetRunId,
      scheduledTriggerInvocationId,
    });
  }

  return {
    success: result.success,
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
