/**
 * HTTP client for triggering evaluations via the eval-api.
 * This avoids importing @inkeep/agents-eval-api directly, which would
 * bundle the workflow code and cause issues on Vercel.
 */

import { EvalApiClient, InternalServices } from '@inkeep/agents-core';
import { getUserIdFromContext } from 'src/types/execution-context.js';
import { env } from '../env.js';
import { getLogger } from '../logger.js';

const logger = getLogger('evaluationHttpClient');

type TriggerConversationEvaluationParams = {
  tenantId: string;
  projectId: string;
  conversationId: string;
  userId?: string;
};

/**
 * Trigger conversation evaluation via HTTP call to eval-api.
 * The eval-api handles ALL evaluation logic: finding run configs, checking sample rates,
 * creating evaluation runs, and executing evaluators.
 * This is a fire-and-forget operation - we don't wait for the evaluation to complete.
 */
export async function triggerConversationEvaluationHttp(
  params: TriggerConversationEvaluationParams
): Promise<void> {
  const evalApiClient = new EvalApiClient({
    apiUrl: env.INKEEP_AGENTS_EVAL_API_URL,
    tenantId: params.tenantId,
    projectId: params.projectId,
    auth: {
      mode: 'internalService',
      internalServiceName: InternalServices.INKEEP_AGENTS_RUN_API,
    },
    userId: params.userId,
  });

  try {
    const response = await evalApiClient.triggerConversationEvaluation({
      conversationId: params.conversationId,
    });

    if (!response.success) {
      logger.error(
        {
          error: response.message,
          ...params,
        },
        'Failed to trigger conversation evaluation via HTTP'
      );
      throw new Error(response.message);
    }
    logger.info(
      {
        conversationId: params.conversationId,
      },
      'Conversation evaluation triggered via HTTP'
    );
  } catch (error) {
    logger.error(
      {
        error,
        ...params,
      },
      'Error triggering conversation evaluation via HTTP'
    );
  }
}
