import {
  type AgentConversationHistoryConfig,
  type Artifact,
  type ConversationHistoryConfig,
  type ConversationScopeOptions,
  createMessage,
  generateId,
  getConversationHistory,
} from '@inkeep/agents-core';
import { runtimeConfig } from '../env';
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
    limit: runtimeConfig.CONVERSATION_HISTORY_DEFAULT_LIMIT,
    includeInternal: true,
    messageTypes: ['chat'],
    maxOutputTokens: 4000,
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
  if (response.error) {
    throw new Error(response.error.message);
  }

  let messageText = '';

  if (response.result.kind === 'message') {
    messageText = extractA2AMessageText(response.result.parts);
  } else if (response.result.kind === 'task') {
    if (response.result.artifacts && response.result.artifacts.length > 0) {
      const firstArtifact = response.result.artifacts[0];
      if (firstArtifact.parts) {
        messageText = extractA2AMessageText(firstArtifact.parts);
      }
    }
  } else if (typeof response.result === 'string') {
    messageText = response.result;
  }

  if (!messageText || messageText.trim() === '') {
    return null;
  }

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
 * Applies filtering based on agent, task, or both criteria
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

    const relevantMessages = messages.filter((msg) => {
      if (msg.role === 'user') return true;

      let matchesAgent = true;
      let matchesTask = true;

      if (filters.subAgentId) {
        matchesAgent =
          (msg.role === 'agent' && msg.visibility === 'user-facing') ||
          msg.toSubAgentId === filters.subAgentId ||
          msg.fromSubAgentId === filters.subAgentId;
      }

      if (filters.taskId) {
        matchesTask = msg.taskId === filters.taskId || msg.a2aTaskId === filters.taskId;
      }

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
  limit = runtimeConfig.CONVERSATION_HISTORY_DEFAULT_LIMIT
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
  const historyOptions = options ?? { includeInternal: true };

  const conversationHistory = await getScopedHistory({
    tenantId,
    projectId,
    conversationId,
    filters,
    options: historyOptions,
  });

  let messagesToFormat = conversationHistory;
  if (currentMessage && conversationHistory.length > 0) {
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    if (lastMessage.content.text === currentMessage) {
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
        const fromSubAgent = msg.fromSubAgentId || msg.fromExternalAgentId || 'unknown';
        const toSubAgent = msg.toSubAgentId || msg.toExternalAgentId || 'unknown';

        roleLabel = `${fromSubAgent} to ${toSubAgent}`;
      } else if (msg.role === 'agent' && msg.messageType === 'chat') {
        const fromSubAgent = msg.fromSubAgentId || 'unknown';
        roleLabel = `${fromSubAgent} to User`;
      } else {
        roleLabel = msg.role || 'system';
      }

      return `${roleLabel}: """${msg.content.text}"""`; // TODO: add timestamp?
    })
    .join('\n');

  return `<conversation_history>\n${formattedHistory}\n</conversation_history>\n`;
}

/**
 * Get artifacts that are within the scope of the conversation history
 * Only returns artifacts from messages that are actually visible to the LLM
 * Uses the same scoping logic as getFormattedConversationHistory
 */
export async function getConversationScopedArtifacts(params: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  historyConfig: AgentConversationHistoryConfig;
}): Promise<Artifact[]> {
  const { tenantId, projectId, conversationId, historyConfig } = params;

  if (!conversationId) {
    return [];
  }

  try {
    if (historyConfig.mode === 'none') {
      return [];
    }

    const visibleMessages = await getScopedHistory({
      tenantId,
      projectId,
      conversationId,
      options: historyConfig,
    });

    if (visibleMessages.length === 0) {
      return [];
    }

    const visibleMessageIds = visibleMessages
      .filter(
        (msg) =>
          !(
            msg.messageType === 'system' &&
            msg.content?.text?.includes('Previous conversation history truncated')
          )
      )
      .map((msg) => msg.id);

    if (visibleMessageIds.length === 0) {
      return [];
    }

    const { getLedgerArtifacts } = await import('@inkeep/agents-core');
    const dbClient = (await import('../data/db/dbClient')).default;

    const visibleTaskIds = visibleMessages
      .map((msg) => msg.taskId)
      .filter((taskId): taskId is string => Boolean(taskId)); // Filter out null/undefined taskIds

    const referenceArtifacts: Artifact[] = [];
    for (const taskId of visibleTaskIds) {
      const artifacts = await getLedgerArtifacts(dbClient)({
        scopes: { tenantId, projectId },
        taskId: taskId,
      });
      referenceArtifacts.push(...artifacts);
    }

    const logger = (await import('../logger')).getLogger('conversations');
    logger.debug(
      {
        conversationId,
        visibleMessages: visibleMessages.length,
        visibleTasks: visibleTaskIds.length,
        artifacts: referenceArtifacts.length,
        historyMode: historyConfig.mode,
      },
      'Loaded conversation-scoped artifacts'
    );

    return referenceArtifacts;
  } catch (error) {
    const logger = (await import('../logger')).getLogger('conversations');
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
      },
      'Failed to get conversation-scoped artifacts'
    );

    return [];
  }
}
