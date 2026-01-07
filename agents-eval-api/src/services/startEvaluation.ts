/**
 * Service to start evaluation workflows.
 * This encapsulates the workflow logic so consumers don't need to import workflow packages.
 */

import { start } from 'workflow/api';
import { evaluateConversationWorkflow } from '../workflow/functions/evaluateConversation';

export interface StartEvaluationParams {
  tenantId: string;
  projectId: string;
  conversationId: string;
  evaluatorIds: string[];
  evaluationRunId: string;
}

/**
 * Start an evaluation workflow for a conversation.
 * This is a convenience wrapper that handles workflow initialization internally.
 */
export async function startConversationEvaluation(params: StartEvaluationParams): Promise<void> {
  // Pass params directly - types match EvaluationPayload exactly
  await start(evaluateConversationWorkflow, [params]);
}
