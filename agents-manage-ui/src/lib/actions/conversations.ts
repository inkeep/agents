'use server';

import {
  type ConversationHistoryResponse,
  fetchConversationHistory,
} from '../api/conversations-client';
import type { ActionResult } from './types';

export async function fetchConversationHistoryAction(
  tenantId: string,
  projectId: string,
  conversationId: string,
  options?: { limit?: number }
): Promise<ActionResult<ConversationHistoryResponse['data'] | null>> {
  try {
    const data = await fetchConversationHistory(tenantId, projectId, conversationId, options);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch conversation history',
    };
  }
}
