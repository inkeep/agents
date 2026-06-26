/**
 * API Client for Conversation Operations
 */

import { makeManagementApiRequest } from './api-config';

/**
 * Mirrors agents-api/src/utils/vercel-message-formatter.ts VercelMessage.
 */
export interface VercelMessage {
  id: string;
  role: string;
  content: string;
  parts: Array<Record<string, unknown>>;
  createdAt: string;
}

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
export interface ConversationVercelResponse {
  data: {
    id: string;
    agentId: string | null;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    messages: VercelMessage[];
  };
}

interface FetchConversationOptions {
  limit?: number;
  format?: 'default' | 'vercel';
}

export async function fetchConversationHistory(
  tenantId: string,
  projectId: string,
  conversationId: string,
  options?: FetchConversationOptions & { format?: 'default' }
): Promise<ConversationHistoryResponse['data']>;
export async function fetchConversationHistory(
  tenantId: string,
  projectId: string,
  conversationId: string,
  options: FetchConversationOptions & { format: 'vercel' }
): Promise<ConversationVercelResponse['data']>;
export async function fetchConversationHistory(
  tenantId: string,
  projectId: string,
  conversationId: string,
  options?: FetchConversationOptions
): Promise<ConversationHistoryResponse['data'] | ConversationVercelResponse['data']> {
  const limit = options?.limit ?? 200;
  const format = options?.format ?? 'default';
  const params = new URLSearchParams({ limit: String(limit) });
  if (format !== 'default') {
    params.set('format', format);
  }
  const response = await makeManagementApiRequest<
    ConversationHistoryResponse | ConversationVercelResponse
  >(
    `tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}?${params.toString()}`
  );
  return response.data;
}
