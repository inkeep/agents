/**
 * HTTP client for triggering evaluations via the eval-api.
 * This avoids importing @inkeep/agents-eval-api directly, which would
 * bundle the workflow code and cause issues on Vercel.
 */

import { getLogger } from '../logger.js';

const logger = getLogger('evaluationHttpClient');

type StartEvaluationParams = {
  tenantId: string;
  projectId: string;
  conversationId: string;
  evaluatorIds: string[];
  evaluationRunId: string;
};

/**
 * Trigger a conversation evaluation via HTTP call to eval-api.
 * This is a fire-and-forget operation - we don't wait for the evaluation to complete.
 */
export async function startConversationEvaluationHttp(params: StartEvaluationParams): Promise<void> {
  const evalApiUrl = process.env.AGENTS_EVAL_API_URL || process.env.INKEEP_AGENTS_EVAL_API_URL;
  
  if (!evalApiUrl) {
    logger.warn({}, 'AGENTS_EVAL_API_URL not set, skipping evaluation trigger');
    return;
  }

  const bypassSecret = process.env.INKEEP_AGENTS_EVAL_API_BYPASS_SECRET;
  
  const url = `${evalApiUrl}/tenants/${params.tenantId}/projects/${params.projectId}/evaluations/trigger`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bypassSecret && { Authorization: `Bearer ${bypassSecret}` }),
      },
      body: JSON.stringify({
        conversationId: params.conversationId,
        evaluatorIds: params.evaluatorIds,
        evaluationRunId: params.evaluationRunId,
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
        'Failed to trigger evaluation via HTTP'
      );
    } else {
      logger.info(
        {
          conversationId: params.conversationId,
          evaluationRunId: params.evaluationRunId,
        },
        'Evaluation triggered via HTTP'
      );
    }
  } catch (error) {
    logger.error(
      {
        error,
        ...params,
      },
      'Error triggering evaluation via HTTP'
    );
  }
}

