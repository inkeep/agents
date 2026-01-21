'use server';

/**
 * Server Actions for Conversation Operations
 *
 * These server actions wrap the Conversations REST API endpoints and provide
 * type-safe functions that can be called from React components.
 */

import {
  fetchConversationHistory as apiFetchConversationHistory,
  type ConversationHistoryResponse,
} from '../api/conversations-client';

/**
 * Result type for server actions - follows a consistent pattern
 */
type ActionResult<T = void> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

/**
 * Fetch conversation history
 */
export async function fetchConversationHistoryAction(
  tenantId: string,
  projectId: string,
  conversationId: string,
  options?: { limit?: number }
): Promise<ActionResult<ConversationHistoryResponse['data'] | null>> {
  try {
    const data = await apiFetchConversationHistory(tenantId, projectId, conversationId, options);
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch conversation history',
      code: 'unknown_error',
    };
  }
}

