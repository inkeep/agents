/**
 * HTTP client for triggering evaluations via the eval-api.
 * This avoids importing @inkeep/agents-eval-api directly, which would
 * bundle the workflow code and cause issues on Vercel.
 */

import { getLogger } from '../logger.js';

const logger = getLogger('evaluationHttpClient');

type TriggerConversationEvaluationParams = {
  tenantId: string;
  projectId: string;
  conversationId: string;
};

/**
 * Trigger conversation evaluation via HTTP call to eval-api.
 * The eval-api handles ALL evaluation logic: finding run configs, checking sample rates,
 * creating evaluation runs, and executing evaluators.
 * This is a fire-and-forget operation - we don't wait for the evaluation to complete.
 */
export async function triggerConversationEvaluationHttp(params: TriggerConversationEvaluationParams): Promise<void> {
  const evalApiUrl = process.env.AGENTS_EVAL_API_URL || 'http://localhost:3005';

  const bypassSecret = process.env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET;
  
  const url = `${evalApiUrl}/tenants/${params.tenantId}/projects/${params.projectId}/evaluations/trigger-conversation`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bypassSecret && { Authorization: `Bearer ${bypassSecret}` }),
      },
      body: JSON.stringify({
        conversationId: params.conversationId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          ...params,
        },
        'Failed to trigger conversation evaluation via HTTP'
      );
    } else {
      logger.info(
        {
          conversationId: params.conversationId,
        },
        'Conversation evaluation triggered via HTTP'
      );
    }
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

