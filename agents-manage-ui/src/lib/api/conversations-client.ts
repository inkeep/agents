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

export interface ConversationBoundsResponse {
  data: {
    id: string;
    metadata?: Record<string, unknown> | null;
    createdAt?: string;
    updatedAt?: string;
  };
}

export async function fetchConversationHistory(
  tenantId: string,
  projectId: string,
  conversationId: string,
  options?: { limit?: number; includeInternal?: boolean }
): Promise<ConversationHistoryResponse['data'] | null> {
  try {
    const limit = options?.limit ?? 200;
    const includeInternal = options?.includeInternal ?? true;
    const response = await makeManagementApiRequest<ConversationHistoryResponse>(
      `tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}?limit=${limit}&includeInternal=${includeInternal ? 1 : 0}`
    );
    return response.data;
  } catch (error) {
    console.warn('Failed to fetch conversation history:', error);
    return null;
  }
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
  } catch {
    return null;
  }
}
