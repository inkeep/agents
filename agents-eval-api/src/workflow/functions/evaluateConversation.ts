import {
  createEvaluationResult,
  generateId,
  getConversation,
  InternalServices,
  ManagementApiClient,
  updateEvaluationResult,
} from '@inkeep/agents-core';
import runDbClient from '../../data/db/runDbClient';
import { getLogger } from '../../logger';
import { EvaluationService } from '../../services/EvaluationService';
import { env } from 'src/env';

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

    
  const client = new ManagementApiClient({
    apiUrl: env.INKEEP_AGENTS_MANAGE_API_URL,
    tenantId,
    projectId,
    auth: { mode: 'internalService', internalServiceName: InternalServices.EVALUATION_API },
  });
  
  const evals = await client.getEvaluatorsByIds(evaluatorIds);  

  return evals;
}

async function executeEvaluatorStep(
  payload: EvaluationPayload,
  evaluatorId: string,
  conversation: any
) {
  'use step';
  
  const { tenantId, projectId, conversationId, evaluationRunId } = payload;
  
  const client = new ManagementApiClient({
    apiUrl: env.INKEEP_AGENTS_MANAGE_API_URL,
    tenantId,
    projectId,
    auth: { mode: 'internalService', internalServiceName: InternalServices.EVALUATION_API },
  });
  const evaluator = await client.getEvaluatorById(evaluatorId);

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
export async function evaluateConversationWorkflow(payload: EvaluationPayload) {
  'use workflow';

  const { conversationId, evaluatorIds } = payload;

  await logStep('Starting conversation evaluation', payload);

  const conversation = await getConversationStep(payload);
  const evaluators = await getEvaluatorsStep(payload);

  if (evaluators.length === 0) {
    await logStep('No valid evaluators found', { conversationId, evaluatorIds });
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

