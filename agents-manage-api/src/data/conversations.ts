import {
  type AgentConversationHistoryConfig,
  CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
  type ConversationHistoryConfig,
  type ConversationScopeOptions,
  createMessage,
  generateId,
  getConversationHistory,
} from '@inkeep/agents-core';
import dbClient from './db/dbClient';

/**
 * Creates default conversation history configuration
 * @param mode - The conversation history mode ('full' | 'scoped' | 'none')
 * @returns Default AgentConversationHistoryConfig
 */
export function createDefaultConversationHistoryConfig(
  mode: 'full' | 'scoped' | 'none' = 'full'
): AgentConversationHistoryConfig {
  return {
    mode,
    limit: 50,
    includeInternal: true,
    messageTypes: ['chat'],
    maxOutputTokens: CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
  };
}

/**
 * Extracts text content from A2A Message parts array
 */
function extractA2AMessageText(parts: Array<{ kind: string; text?: string }>): string {
  return parts
    .filter((part) => part.kind === 'text' && part.text)
    .map((part) => part.text)
    .join('');
}

/**
 * Saves the result of an A2A client sendMessage call as a conversation message
 * @param response - The response from a2aClient.sendMessage()
 * @param params - Parameters for saving the message
 * @returns The saved message or null if no text content was found
 */
export async function saveA2AMessageResponse(
  response: any, // SendMessageResponse type
  params: {
    tenantId: string;
    projectId: string;
    conversationId: string;
    messageType: 'a2a-response' | 'a2a-request';
    visibility: 'internal' | 'external' | 'user-facing';
    fromSubAgentId?: string;
    toSubAgentId?: string;
    fromExternalAgentId?: string;
    toExternalAgentId?: string;
    a2aTaskId?: string;
    a2aSessionId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<any | null> {
  // Handle error responses
  if (response.error) {
    throw new Error(response.error.message);
  }

  // Extract text content based on result type
  let messageText = '';

  if (response.result.kind === 'message') {
    // Handle Message type with parts array
    messageText = extractA2AMessageText(response.result.parts);
  } else if (response.result.kind === 'task') {
    // Handle Task type - extract text from artifacts if available
    if (response.result.artifacts && response.result.artifacts.length > 0) {
      const firstArtifact = response.result.artifacts[0];
      if (firstArtifact.parts) {
        messageText = extractA2AMessageText(firstArtifact.parts);
      }
    }
  } else if (typeof response.result === 'string') {
    // Handle direct string responses (for backward compatibility)
    messageText = response.result;
  }

  // Only save if we have meaningful text content
  if (!messageText || messageText.trim() === '') {
    return null;
  }

  // Save the message
  return await createMessage(dbClient)({
    id: generateId(),
    tenantId: params.tenantId,
    projectId: params.projectId,
    conversationId: params.conversationId,
    role: 'agent',
    content: {
      text: messageText,
    },
    visibility: params.visibility,
    messageType: params.messageType,
    fromSubAgentId: params.fromSubAgentId,
    toSubAgentId: params.toSubAgentId,
    fromExternalAgentId: params.fromExternalAgentId,
    toExternalAgentId: params.toExternalAgentId,
    a2aTaskId: params.a2aTaskId,
    a2aSessionId: params.a2aSessionId,
    metadata: params.metadata,
  });
}

/**
 * Applies filtering based on sub-agent, task, or both criteria
 * Returns the filtered messages array
 */
export async function getScopedHistory({
  tenantId,
  projectId,
  conversationId,
  filters,
  options,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  filters?: ConversationScopeOptions;
  options?: ConversationHistoryConfig;
}): Promise<any[]> {
  try {
    const messages = await getConversationHistory(dbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      options,
    });

    if (!filters || (!filters.subAgentId && !filters.taskId)) {
      return messages;
    }

    // Filter messages based on provided criteria
    const relevantMessages = messages.filter((msg) => {
      // Always include user messages
      if (msg.role === 'user') return true;

      let matchesAgent = true;
      let matchesTask = true;

      // Apply agent filtering if subAgentId is provided
      if (filters.subAgentId) {
        matchesAgent =
          (msg.role === 'agent' && msg.visibility === 'user-facing') ||
          msg.toSubAgentId === filters.subAgentId ||
          msg.fromSubAgentId === filters.subAgentId;
      }

      // Apply task filtering if taskId is provided
      if (filters.taskId) {
        matchesTask = msg.taskId === filters.taskId || msg.a2aTaskId === filters.taskId;
      }

      // For combined filtering (both agent and task), both must match
      // For single filtering, only the relevant one needs to match
      if (filters.subAgentId && filters.taskId) {
        return matchesAgent && matchesTask;
      }

      if (filters.subAgentId) {
        return matchesAgent;
      }

      if (filters.taskId) {
        return matchesTask;
      }

      return false;
    });

    return relevantMessages;
  } catch (error) {
    console.error('Failed to fetch scoped messages:', error);
    return [];
  }
}

/**
 * Get user-facing conversation history (for client display)
 */
export async function getUserFacingHistory(
  tenantId: string,
  projectId: string,
  conversationId: string,
  limit = 50
): Promise<any[]> {
  return await getConversationHistory(dbClient)({
    scopes: { tenantId, projectId },
    conversationId,
    options: {
      limit,
      includeInternal: false,
      messageTypes: ['chat'],
    },
  });
}

/**
 * Get full conversation context (for agent processing)
 */
export async function getFullConversationContext(
  tenantId: string,
  projectId: string,
  conversationId: string,
  maxTokens?: number
): Promise<any[]> {
  return await getConversationHistory(dbClient)({
    scopes: { tenantId, projectId },
    conversationId,
    options: {
      limit: 100,
      includeInternal: true,
      maxOutputTokens: maxTokens,
    },
  });
}

/**
 * Get formatted conversation history for a2a
 */
export async function getFormattedConversationHistory({
  tenantId,
  projectId,
  conversationId,
  currentMessage,
  options,
  filters,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  currentMessage?: string;
  options?: ConversationHistoryConfig;
  filters?: ConversationScopeOptions;
}): Promise<string> {
  // Ensure includeInternal defaults to true for formatted history
  const historyOptions = options ?? { includeInternal: true };

  const conversationHistory = await getScopedHistory({
    tenantId,
    projectId,
    conversationId,
    filters,
    options: historyOptions,
  });

  // Filter out the current message if it's the most recent one
  let messagesToFormat = conversationHistory;
  if (currentMessage && conversationHistory.length > 0) {
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    if (lastMessage.content.text === currentMessage) {
      // Remove the last message if it matches the current prompt
      messagesToFormat = conversationHistory.slice(0, -1);
    }
  }

  if (!messagesToFormat.length) {
    return '';
  }

  const formattedHistory = messagesToFormat
    .map((msg: any) => {
      let roleLabel: string;

      if (msg.role === 'user') {
        roleLabel = 'user';
      } else if (
        msg.role === 'agent' &&
        (msg.messageType === 'a2a-request' || msg.messageType === 'a2a-response')
      ) {
        // For agent messages, include sender and recipient info when available
        const fromSubAgent = msg.fromSubAgentId || msg.fromExternalAgentId || 'unknown';
        const toSubAgent = msg.toSubAgentId || msg.toExternalAgentId || 'unknown';

        roleLabel = `${fromSubAgent} to ${toSubAgent}`;
      } else if (msg.role === 'agent' && msg.messageType === 'chat') {
        const fromSubAgent = msg.fromSubAgentId || 'unknown';
        roleLabel = `${fromSubAgent} to User`;
      } else {
        // System or other message types
        roleLabel = msg.role || 'system';
      }

      return `${roleLabel}: """${msg.content.text}"""`; // TODO: add timestamp?
    })
    .join('\n');

  return `<conversation_history>\n${formattedHistory}\n</conversation_history>\n`;
}
