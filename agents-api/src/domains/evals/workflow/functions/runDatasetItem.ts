/**
 * Workflow for running dataset items via direct agent execution.
 *
 * Each item is queued independently and processed in parallel by the workflow
 * system. Execution calls executeAgentAsync directly — dataset runs bypass
 * the scheduled trigger step and own their own timeout + ref resolution.
 */
import type { DatasetItemInput } from '@inkeep/agents-core';
import {
  addConversationIdToInvocation,
  createDatasetRunConversationRelation,
  createEvaluationResult,
  generateId,
  getAgentIdsForEvaluators,
  getConversation,
  getEvaluatorById,
  getProjectScopedRef,
  isForeignKeyViolation,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  resolveRef,
  updateEvaluationResult,
  updateTriggerInvocationStatus,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../../data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { executeAgentAsync } from '../../../run/services/TriggerService';
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
  ref?: string;
};

/**
 * Step: Execute the dataset item by calling executeAgentAsync directly
 */
async function executeDatasetItemStep(payload: RunDatasetItemPayload) {
  'use step';

  const {
    tenantId,
    projectId,
    agentId,
    datasetItemInput,
    datasetRunId,
    scheduledTriggerInvocationId,
    timeoutSeconds,
  } = payload;

  const conversationId = generateId();
  const effectiveTimeout = timeoutSeconds ?? 300;

  try {
    const ref = getProjectScopedRef(tenantId, projectId, payload.ref || 'main');
    const resolvedRef = await resolveRef(manageDbClient)(ref);

    if (!resolvedRef) {
      return {
        success: false,
        conversationId,
        error: `Failed to resolve ref for project ${projectId}`,
      };
    }

    const timeoutMs = effectiveTimeout * 1000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Execution timed out after ${effectiveTimeout}s`)),
        timeoutMs
      );
    });

    await Promise.race([
      executeAgentAsync({
        tenantId,
        projectId,
        agentId,
        triggerId: datasetRunId,
        invocationId: scheduledTriggerInvocationId,
        conversationId,
        resolvedRef,
        messages: datasetItemInput.messages,
        invocationType: 'scheduled_trigger',
        datasetRunId,
      }),
      timeoutPromise,
    ]);

    return { success: true, conversationId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        datasetRunId,
        invocationId: scheduledTriggerInvocationId,
        conversationId,
        error: errorMessage,
      },
      'Dataset item execution failed'
    );
    return { success: false, conversationId, error: errorMessage };
  }
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

  try {
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
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      logger.warn(
        { tenantId, projectId, datasetItemId, datasetRunId, conversationId },
        'Conversation does not exist, skipping relation creation'
      );
    } else {
      throw error;
    }
  }
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

  await Promise.all([
    markScheduledTriggerInvocationCompleted(runDbClient)({
      scopes: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
      },
      scheduledTriggerId: params.datasetRunId,
      invocationId: params.scheduledTriggerInvocationId,
    }),
    updateTriggerInvocationStatus(runDbClient)({
      scopes: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
      },
      triggerId: params.datasetRunId,
      invocationId: params.scheduledTriggerInvocationId,
      data: { status: 'success' },
    }).catch(() => {}),
  ]);
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

  await Promise.all([
    markScheduledTriggerInvocationFailed(runDbClient)({
      scopes: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
      },
      scheduledTriggerId: params.datasetRunId,
      invocationId: params.scheduledTriggerInvocationId,
    }),
    updateTriggerInvocationStatus(runDbClient)({
      scopes: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
      },
      triggerId: params.datasetRunId,
      invocationId: params.scheduledTriggerInvocationId,
      data: { status: 'failed' },
    }).catch(() => {}),
  ]);
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
  expectedOutput?: unknown,
  branchRef?: string
) {
  'use step';

  const ref = getProjectScopedRef(tenantId, projectId, branchRef || 'main');
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
 * Step: Filter evaluators by agent scoping.
 * Evaluators with no agent relations pass through (project-wide).
 * Evaluators scoped to specific agents are kept only if agentId matches.
 */
async function filterEvaluatorsByAgentStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  evaluatorIds: string[];
  ref?: string;
}): Promise<string[]> {
  'use step';

  const { tenantId, projectId, agentId, evaluatorIds } = params;
  const ref = getProjectScopedRef(tenantId, projectId, params.ref || 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    return evaluatorIds;
  }

  const agentIdsMap = await withRef(manageDbPool, resolvedRef, (db) =>
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
      'Filtered evaluators by agent scoping in dataset run'
    );
  }

  return filtered;
}

/**
 * Main workflow function - processes a single dataset item.
 * Calls executeAgentAsync directly for agent execution.
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
      const filteredEvaluatorIds = await filterEvaluatorsByAgentStep({
        tenantId,
        projectId,
        agentId,
        evaluatorIds,
        ref: payload.ref,
      });

      for (const evaluatorId of filteredEvaluatorIds) {
        await executeEvaluatorStep(
          tenantId,
          projectId,
          result.conversationId,
          evaluatorId,
          evaluationRunId,
          payload.datasetItemExpectedOutput,
          payload.ref
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
