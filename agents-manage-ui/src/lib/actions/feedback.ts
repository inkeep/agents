'use server';

import { revalidatePath } from 'next/cache';
import {
  createFeedback,
  deleteFeedback,
  type Feedback,
  type FeedbackCreate,
} from '../api/feedback';
import { rerunTrigger } from '../api/triggers';
import { ApiError } from '../types/errors';
import { buildSummarizedTrace } from '../utils/trace-formatter';
import { fetchConversationDetailAction } from './conversations';
import type { ActionResult } from './types';

export async function createFeedbackAction(
  tenantId: string,
  projectId: string,
  feedbackData: FeedbackCreate
): Promise<ActionResult<Feedback>> {
  try {
    const feedback = await createFeedback(tenantId, projectId, feedbackData);
    revalidatePath(`/${tenantId}/projects/${projectId}/feedback`);
    return {
      success: true,
      data: feedback,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function deleteFeedbackAction(
  tenantId: string,
  projectId: string,
  feedbackId: string
): Promise<ActionResult<void>> {
  try {
    await deleteFeedback(tenantId, projectId, feedbackId);
    revalidatePath(`/${tenantId}/projects/${projectId}/feedback`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

const FEEDBACK_IMPROVE_TRIGGER_ID = 'feedback-improve';

export async function triggerFeedbackImprovementAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  params: {
    feedbackDetails: string;
    conversationId?: string;
    messageId?: string;
    targetTenantId: string;
    targetProjectId: string;
    targetAgentId?: string;
  }
): Promise<ActionResult<{ invocationId: string; conversationId: string }>> {
  try {
    const forwardedHeaders: Record<string, string> = {
      'x-target-tenant-id': params.targetTenantId,
      'x-target-project-id': params.targetProjectId,
    };
    if (params.targetAgentId) {
      forwardedHeaders['x-target-agent-id'] = params.targetAgentId;
    }
    if (params.conversationId) {
      forwardedHeaders['x-inkeep-from-conversation-id'] = params.conversationId;
    }
    if (params.messageId) {
      forwardedHeaders['x-inkeep-from-message-id'] = params.messageId;
    }

    let userMessage = params.feedbackDetails;

    if (params.conversationId) {
      try {
        const detailResult = await fetchConversationDetailAction(
          params.targetTenantId,
          params.targetProjectId,
          params.conversationId
        );

        if (detailResult.success && detailResult.data) {
          const trace = await buildSummarizedTrace(
            detailResult.data,
            params.targetTenantId,
            params.targetProjectId
          );

          let feedbackSection: string;
          if (params.messageId) {
            const assistantMessages = (detailResult.data.activities || []).filter(
              (a) => a.type === 'ai_assistant_message' && a.aiResponseContent
            );
            const lastAssistant = assistantMessages[assistantMessages.length - 1];
            const contentPreview = lastAssistant?.aiResponseContent
              ? `\n\nThe message content is:\n> ${lastAssistant.aiResponseContent.slice(0, 500)}`
              : '';
            feedbackSection = `### Feedback\nThis feedback is about a **specific assistant message**. Focus your improvements on this message and the agent behavior that produced it.${contentPreview}\n\n${params.feedbackDetails}`;
          } else {
            feedbackSection = `### Feedback\n${params.feedbackDetails}`;
          }

          userMessage = `${feedbackSection}\n\n### Conversation Trace\n\`\`\`json\n${JSON.stringify(trace, null, 2)}\n\`\`\``;
        }
      } catch {
        // Best-effort: if trace enrichment fails, send the plain feedback text
      }
    }

    const result = await rerunTrigger(tenantId, projectId, agentId, FEEDBACK_IMPROVE_TRIGGER_ID, {
      userMessage,
      forwardedHeaders,
    });

    return {
      success: true,
      data: { invocationId: result.invocationId, conversationId: result.conversationId },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger feedback improvement',
      code: 'unknown_error',
    };
  }
}
