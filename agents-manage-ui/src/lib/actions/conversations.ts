'use server';

import type { ConversationDetail } from '@/components/traces/timeline/types';
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

export async function fetchConversationDetailAction(
  tenantId: string,
  projectId: string,
  conversationId: string
): Promise<ActionResult<ConversationDetail>> {
  try {
    const manageUiUrl = process.env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
    const res = await fetch(
      `${manageUiUrl}/api/signoz/conversations/${conversationId}?tenantId=${tenantId}&projectId=${projectId}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      return {
        success: false,
        error: `SigNoz fetch failed: ${res.status} ${res.statusText}`,
      };
    }

    const data: ConversationDetail = await res.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch conversation detail',
    };
  }
}
