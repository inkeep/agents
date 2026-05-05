/**
 * API Client for Conversation Operations
 */

import { makeManagementApiRequest } from './api-config';

export interface ConversationHistoryResponse {
  data: {
    conversation: {
      id: string;
      agentId: string | null;
      title: string | null;
      userProperties: Record<string, unknown> | null;
      properties: Record<string, unknown> | null;
      createdAt: string;
      updatedAt: string;
      messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string | null;
        createdAt: string;
      }>;
    };
    formatted: {
      llmContext: string;
    };
  };
}

/**
 * Fetches conversation history from the API
 */
export async function fetchConversationHistory(
  tenantId: string,
  projectId: string,
  conversationId: string,
  options?: { limit?: number }
): Promise<ConversationHistoryResponse['data'] | null> {
  try {
    const limit = options?.limit ?? 200;
    const response = await makeManagementApiRequest<ConversationHistoryResponse>(
      `tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}?limit=${limit}`
    );
    return response.data;
  } catch (error) {
    console.warn('Failed to fetch conversation history:', error);
    return null;
  }
}
