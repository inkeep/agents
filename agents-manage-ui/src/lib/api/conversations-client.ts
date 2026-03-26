/**
 * API Client for Conversation Operations
 */

import { makeManagementApiRequest } from './api-config';

export interface ConversationHistoryResponse {
  data: {
    messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
      createdAt?: string;
    }>;
    formatted: {
      llmContext: string;
    };
  };
}

/**
 * Fetches conversation history from the API
 */
export interface ConversationBoundsResponse {
  data: {
    createdAt: string;
    updatedAt: string;
    agentId: string | null;
  };
}

export async function fetchConversationBounds(
  tenantId: string,
  projectId: string,
  conversationId: string
): Promise<ConversationBoundsResponse['data'] | null> {
  try {
    const response = await makeManagementApiRequest<ConversationBoundsResponse>(
      `tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}/bounds`
    );
    return response.data;
  } catch (error) {
    console.warn('Failed to fetch conversation bounds:', error);
    return null;
  }
}

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
