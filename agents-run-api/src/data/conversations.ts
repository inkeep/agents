import {
  type AgentConversationHistoryConfig,
  type Artifact,
  CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
  type ConversationHistoryConfig,
  type ConversationScopeOptions,
  createMessage,
  executeInBranch,
  generateId,
  getConversationHistory,
  getLedgerArtifacts,
  type ResolvedRef,
} from '@inkeep/agents-core';
import { CONVERSATION_HISTORY_DEFAULT_LIMIT } from '../constants/execution-limits';
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
    limit: CONVERSATION_HISTORY_DEFAULT_LIMIT,
    includeInternal: true,
    messageTypes: ['chat', 'tool-result'],
    maxOutputTokens: CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
  };
}

/**
 * Extracts text content from A2A Message parts array
 * Escapes control characters to ensure proper JSON serialization for Dolt
 */
function extractA2AMessageText(parts: Array<{ kind: string; text?: string }>): string {
  const text = parts
    .filter((part) => part.kind === 'text' && part.text)
    .map((part) => part.text)
    .join('');

  // Escape control characters that Dolt's JSON parser rejects
  // This ensures the text will serialize properly without changing its meaning
  // We replace literal control characters with their escaped equivalents
  return text
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t') // Escape tabs
    .replace(/\f/g, '\\f') // Escape form feeds
    .replace(/\b/g, '\\b'); // Escape backspaces
}

/**
 * Saves the result of an A2A client sendMessage call as a conversation message
 * @param response - The response from a2aClient.sendMessage()
 * @param params - Parameters for saving the message
 * @returns The saved message or null if no text content was found
 */
export async function saveA2AMessageResponse(
  response: any, // SendMessageResponse type
  ref: ResolvedRef,
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

  return await executeInBranch(
    {
      dbClient,
      ref,
    },
    async (db) => {
      return await createMessage(db)({
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
  );
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
  ref,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  filters?: ConversationScopeOptions;
  options?: ConversationHistoryConfig;
  ref: ResolvedRef;
}): Promise<any[]> {
  try {
    const messages = await executeInBranch(
      {
        dbClient,
        ref,
      },
      async (db) => {
        return await getConversationHistory(db)({
          scopes: { tenantId, projectId },
          conversationId,
          options,
        });
      }
    );

    if (
      !filters ||
      (!filters.subAgentId &&
        !filters.taskId &&
        !filters.delegationId &&
        filters.isDelegated === undefined)
    ) {
      return messages;
    }

    const relevantMessages = messages.filter((msg) => {
      if (msg.role === 'user') return true;

      let matchesAgent = true;
      let matchesTask = true;
      let matchesDelegation = true;

      if (filters.subAgentId) {
        matchesAgent =
          (msg.role === 'agent' && msg.visibility === 'user-facing') ||
          msg.toSubAgentId === filters.subAgentId ||
          msg.fromSubAgentId === filters.subAgentId;
      }

      if (filters.taskId) {
        matchesTask = msg.taskId === filters.taskId || msg.a2aTaskId === filters.taskId;
      }

      // Delegation filtering for tool results
      if (filters.delegationId !== undefined || filters.isDelegated !== undefined) {
        if (msg.messageType === 'tool-result') {
          const messageDelegationId = msg.metadata?.a2a_metadata?.delegationId;
          const messageIsDelegated = msg.metadata?.a2a_metadata?.isDelegated;

          if (filters.delegationId) {
            // If we have a specific delegation ID, show tool results from that delegation OR no delegation (top-level)
            matchesDelegation =
              messageDelegationId === filters.delegationId || !messageDelegationId;
          } else if (filters.isDelegated === false) {
            // If we're NOT delegated, only show tool results that aren't delegated
            matchesDelegation = !messageIsDelegated;
          } else if (filters.isDelegated === true) {
            // If we ARE delegated but no specific ID, show any delegated tool results
            matchesDelegation = messageIsDelegated === true;
          }
        }
        // Non-tool-result messages are not affected by delegation filtering
      }

      // Combine all filters
      const conditions = [];
      if (filters.subAgentId) conditions.push(matchesAgent);
      if (filters.taskId) conditions.push(matchesTask);
      if (filters.delegationId !== undefined || filters.isDelegated !== undefined)
        conditions.push(matchesDelegation);

      const finalResult = conditions.length === 0 || conditions.every(Boolean);

      return finalResult;
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
  ref: ResolvedRef,
  limit = CONVERSATION_HISTORY_DEFAULT_LIMIT
): Promise<any[]> {
  return await executeInBranch(
    {
      dbClient,
      ref,
    },
    async (db) => {
      return await getConversationHistory(db)({
        scopes: { tenantId, projectId },
        conversationId,
        options: {
          limit,
          includeInternal: false,
          messageTypes: ['chat'],
        },
      });
    }
  );
}

/**
 * Get full conversation context (for agent processing)
 */
export async function getFullConversationContext(
  tenantId: string,
  projectId: string,
  conversationId: string,
  ref: ResolvedRef,
  maxTokens?: number
): Promise<any[]> {
  const defaultConfig = createDefaultConversationHistoryConfig();
  return await executeInBranch(
    {
      dbClient,
      ref,
    },
    async (db) => {
      return await getConversationHistory(db)({
        scopes: { tenantId, projectId },
        conversationId,
        options: {
          ...defaultConfig,
          limit: 100,
          includeInternal: true,
          maxOutputTokens: maxTokens,
        },
      });
    }
  );
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
  ref,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  currentMessage?: string;
  options?: ConversationHistoryConfig;
  filters?: ConversationScopeOptions;
  ref: ResolvedRef;
}): Promise<string> {
  const historyOptions = options ?? createDefaultConversationHistoryConfig();

  const conversationHistory = await getScopedHistory({
    tenantId,
    projectId,
    conversationId,
    filters,
    options: historyOptions,
    ref,
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
      } else if (msg.role === 'assistant' && msg.messageType === 'tool-result') {
        const fromSubAgent = msg.fromSubAgentId || 'unknown';
        const toolName = msg.metadata?.a2a_metadata?.toolName || 'unknown';
        roleLabel = `${fromSubAgent} tool: ${toolName}`;
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
  ref: ResolvedRef;
}): Promise<Artifact[]> {
  const { tenantId, projectId, conversationId, historyConfig, ref } = params;

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
      ref,
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

    const visibleTaskIds = visibleMessages
      .map((msg) => msg.taskId)
      .filter((taskId): taskId is string => Boolean(taskId)); // Filter out null/undefined taskIds

    const referenceArtifacts: Artifact[] = [];
    for (const taskId of visibleTaskIds) {
      const artifacts = await executeInBranch(
        {
          dbClient,
          ref,
        },
        async (db) => {
          return await getLedgerArtifacts(db)({
            scopes: { tenantId, projectId },
            taskId: taskId,
          });
        }
      );
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
