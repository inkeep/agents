import {
  type AgentConversationHistoryConfig,
  type Artifact,
  CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
  type ConversationHistoryConfig,
  type ConversationScopeOptions,
  createMessage,
  generateId,
  getConversationHistory,
  getLedgerArtifacts,
  type ResolvedRef,
} from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import {
  CONVERSATION_ARTIFACTS_LIMIT,
  CONVERSATION_HISTORY_DEFAULT_LIMIT,
} from '../constants/execution-limits';
import { ConversationCompressor } from '../services/ConversationCompressor';

const logger = getLogger('conversations');

// In-memory lock to prevent concurrent compression for the same conversation
export const compressionLocks = new Map<string, Promise<any>>();

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

  return await createMessage(runDbClient)({
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
    // First, get ALL messages to find the latest compression summary
    // IMPORTANT: Always include internal messages and disable truncation to ensure tool results are available
    const allMessages = await getConversationHistory(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      options: { ...options, limit: 10000, includeInternal: true, maxOutputTokens: undefined }, // Disable truncation
    });

    // Find the latest compression summary (highest order/createdAt)
    const compressionSummaries = allMessages.filter(
      (msg) =>
        msg.messageType === 'compression_summary' &&
        (msg.metadata?.a2a_metadata?.compressionType === 'conversation_history' ||
          msg.metadata?.compressionType === 'conversation_history')
    );

    const latestCompressionSummary =
      compressionSummaries.length > 0
        ? compressionSummaries.reduce((latest, current) =>
            new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest
          )
        : null;

    const limit = options?.limit;

    let messages: any[];
    if (latestCompressionSummary) {
      // Get the summary + all messages after it
      const summaryDate = new Date(latestCompressionSummary.createdAt);
      const messagesAfter = allMessages.filter(
        (msg) => new Date(msg.createdAt) > summaryDate && msg.messageType !== 'compression_summary'
      );
      messages = [
        latestCompressionSummary,
        ...(limit ? messagesAfter.slice(-limit) : messagesAfter),
      ];

      logger.debug(
        {
          conversationId,
          latestCompressionSummaryId: latestCompressionSummary.id,
          summaryDate: summaryDate.toISOString(),
          messagesAfterCompression: messages.length - 1,
          totalMessages: allMessages.length,
        },
        'Retrieved conversation with compression summary'
      );
    } else {
      messages = limit ? allMessages.slice(-limit) : allMessages;

      logger.debug(
        {
          conversationId,
          totalMessages: messages.length,
        },
        'Retrieved conversation without compression summary'
      );
    }

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
    logger.error({ error }, 'Failed to fetch scoped messages');
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
  limit = CONVERSATION_HISTORY_DEFAULT_LIMIT
): Promise<any[]> {
  return await getConversationHistory(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
    options: { limit, includeInternal: false, messageTypes: ['chat'] },
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
  const defaultConfig = createDefaultConversationHistoryConfig();
  return await getConversationHistory(runDbClient)({
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
  sessionId,
  summarizerModel,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  currentMessage?: string;
  options?: ConversationHistoryConfig;
  filters?: ConversationScopeOptions;
  sessionId?: string;
  summarizerModel?: any;
}): Promise<string> {
  const historyOptions = options ?? createDefaultConversationHistoryConfig();

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

  // Apply conversation compression if needed and enabled
  let finalMessagesToFormat = messagesToFormat;
  if (sessionId && summarizerModel) {
    finalMessagesToFormat = await compressConversationIfNeeded(messagesToFormat, {
      conversationId,
      tenantId,
      projectId,
      summarizerModel,
      streamRequestId: sessionId,
    });
  }

  const formattedHistory = finalMessagesToFormat
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
 * Modern conversation history retrieval with compression support
 * Replaces getFormattedConversationHistory with built-in compression when needed
 */
export async function getConversationHistoryWithCompression({
  tenantId,
  projectId,
  conversationId,
  currentMessage,
  options,
  filters,
  summarizerModel,
  baseModel,
  streamRequestId,
  fullContextSize,
}: {
  tenantId: string;
  projectId: string;
  conversationId: string;
  currentMessage?: string;
  options?: ConversationHistoryConfig;
  filters?: ConversationScopeOptions;
  summarizerModel?: any;
  baseModel?: any;
  streamRequestId?: string;
  fullContextSize?: number;
}): Promise<string> {
  const historyOptions = options ?? createDefaultConversationHistoryConfig();

  // IMPORTANT: For conversation compression, we MUST include internal messages (tool results)
  // Tool results are saved with visibility: 'internal' and are essential for compression summaries
  // Also disable maxOutputTokens limit to let compression system handle context management
  const compressionOptions = {
    ...historyOptions,
    includeInternal: true,
    maxOutputTokens: undefined,
    limit: undefined,
  };

  // Get scoped history (same as legacy method)
  const conversationHistory = await getScopedHistory({
    tenantId,
    projectId,
    conversationId,
    filters,
    options: compressionOptions,
  });

  // Remove current message if it matches the last message (same as legacy)
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

  // Replace tool-result content with compact artifact references BEFORE compression.
  // This ensures the compressor sees the actual trimmed size rather than the raw
  // oversized tool output that was already persisted as a ledger artifact.
  const toolCallIds = messagesToFormat
    .filter((msg) => msg.messageType === 'tool-result')
    .map((msg) => msg.metadata?.a2a_metadata?.toolCallId)
    .filter((id): id is string => !!id);

  if (toolCallIds.length > 0) {
    try {
      const artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
        toolCallIds,
      });
      const artifactsByToolCallId = new Map(
        artifacts.filter((a) => a.toolCallId).map((a) => [a.toolCallId as string, a])
      );
      if (artifactsByToolCallId.size > 0) {
        messagesToFormat = messagesToFormat.map((msg) => {
          if (msg.messageType !== 'tool-result') return msg;
          const tcId = msg.metadata?.a2a_metadata?.toolCallId;
          const artifact = tcId ? artifactsByToolCallId.get(tcId) : undefined;
          if (!artifact) return msg;
          const toolArgs = msg.metadata?.a2a_metadata?.toolArgs;
          const rawArgs = toolArgs ? JSON.stringify(toolArgs) : undefined;
          const argsStr =
            rawArgs && rawArgs.length > 300 ? `${rawArgs.slice(0, 300)}...[truncated]` : rawArgs;
          const dataPart = artifact.parts?.find(
            (p): p is Extract<(typeof artifact.parts)[number], { kind: 'data' }> =>
              p.kind === 'data'
          );
          const summaryValue = dataPart?.data?.summary;
          const rawSummary = summaryValue ? JSON.stringify(summaryValue) : undefined;
          const summaryDataStr =
            rawSummary && rawSummary.length > 1000
              ? `${rawSummary.slice(0, 1000)}...[truncated]`
              : rawSummary;
          const refParts = [
            `Artifact: "${artifact.name ?? artifact.artifactId}" (id: ${artifact.artifactId})`,
          ];
          if (argsStr) refParts.push(`args: ${argsStr}`);
          if (artifact.description) refParts.push(`description: ${artifact.description}`);
          if (summaryDataStr) refParts.push(`summary: ${summaryDataStr}`);
          return {
            ...msg,
            content: { text: `[${refParts.join(' | ')}]` },
          };
        });
      }
    } catch (err) {
      logger.warn(
        { err, conversationId, unsubstitutedCount: toolCallIds.length },
        'Failed to fetch artifacts for conversation history — tool results will not be substituted, compression may trigger unnecessarily'
      );
      trace.getActiveSpan()?.setAttribute('artifact_lookup.failed', true);
    }
  }

  if (summarizerModel) {
    const firstMsg = messagesToFormat[0];
    const compressionSummary =
      firstMsg?.messageType === 'compression_summary' &&
      (firstMsg?.metadata?.a2a_metadata?.compressionType === 'conversation_history' ||
        firstMsg?.metadata?.compressionType === 'conversation_history')
        ? firstMsg
        : null;

    if (compressionSummary) {
      const priorSummary = compressionSummary.metadata?.a2a_metadata?.summaryData ?? null;
      const messagesAfterCompression = messagesToFormat.slice(1);

      const recompressResult = await compressConversationIfNeeded(messagesAfterCompression, {
        conversationId,
        tenantId,
        projectId,
        summarizerModel,
        baseModel,
        streamRequestId,
        fullContextSize,
        priorSummary,
      });

      const wasRecompressed = recompressResult[0]?.messageType === 'compression_summary';
      messagesToFormat = wasRecompressed
        ? recompressResult
        : [compressionSummary, ...messagesAfterCompression];
    } else {
      messagesToFormat = await compressConversationIfNeeded(messagesToFormat, {
        conversationId,
        tenantId,
        projectId,
        summarizerModel,
        baseModel,
        streamRequestId,
        fullContextSize,
      });
    }
  }

  return formatMessagesAsConversationHistory(messagesToFormat);
}

/**
 * Apply conversation compression using the BaseCompressor infrastructure
 */
export async function compressConversationIfNeeded(
  messages: any[],
  params: {
    conversationId: string;
    tenantId: string;
    projectId: string;
    summarizerModel: any;
    baseModel?: any;
    streamRequestId?: string;
    fullContextSize?: number;
    priorSummary?: any;
  }
): Promise<any[]> {
  const { conversationId, tenantId, projectId } = params;

  // Prevent race conditions by using conversation-level locking
  const lockKey = `${conversationId}_${tenantId}_${projectId}`;

  // If there's already a compression in progress, wait for it to complete
  if (compressionLocks.has(lockKey)) {
    logger.debug({ conversationId }, 'Waiting for existing compression to complete');
    await compressionLocks.get(lockKey);
    // Return original messages since compression was already handled
    return messages;
  }

  // Create a new compression promise and store it in the lock
  const compressionPromise = performActualCompression(messages, params);
  compressionLocks.set(lockKey, compressionPromise);

  try {
    const result = await compressionPromise;
    return result;
  } finally {
    // Always clean up the lock when done
    compressionLocks.delete(lockKey);
  }
}

async function performActualCompression(
  messages: any[],
  params: {
    conversationId: string;
    tenantId: string;
    projectId: string;
    summarizerModel: any;
    baseModel?: any;
    streamRequestId?: string;
    fullContextSize?: number;
    priorSummary?: any;
  }
): Promise<any[]> {
  const {
    conversationId,
    tenantId,
    projectId,
    summarizerModel,
    baseModel,
    priorSummary,
    streamRequestId,
  } = params;

  // Use streamRequestId when available (for agent transfers), otherwise conversationId
  const sessionIdForCompression = streamRequestId || conversationId;
  const compressor = new ConversationCompressor(
    sessionIdForCompression,
    conversationId,
    tenantId,
    projectId,
    { summarizerModel, baseModel, priorSummary }
  );

  // Check if compression is needed based on model context limits
  if (!compressor.isCompressionNeeded(messages)) {
    return messages;
  }

  logger.info(
    {
      conversationId,
      messageCount: messages.length,
    },
    'Applying conversation-level compression'
  );

  try {
    const compressionResult = await compressor.safeCompress(messages, params.fullContextSize);

    // Save compression summary as a message in the database with proper ordering
    if (compressionResult.summary) {
      const compressionMessage = await createMessage(runDbClient)({
        id: generateId(),
        tenantId,
        projectId,
        conversationId,
        role: 'system',
        content: {
          text: buildCompressionSummaryMessage(
            compressionResult.summary,
            compressionResult.artifactIds
          ),
        },
        visibility: 'internal',
        messageType: 'compression_summary',
        metadata: {
          a2a_metadata: {
            compressionType: 'conversation_history',
            artifactIds: compressionResult.artifactIds,
            originalMessageCount: messages.length,
            compressedAt: new Date().toISOString(),
            summaryData: compressionResult.summary,
          },
        },
      });

      logger.debug(
        {
          conversationId,
          originalMessageCount: messages.length,
          artifactCount: compressionResult.artifactIds?.length || 0,
          compressionMessageId: compressionMessage.id,
        },
        'Conversation compression saved to messages table'
      );

      // Return just the compression summary message
      compressor.fullCleanup();
      return [compressionMessage];
    }

    compressor.fullCleanup();
    return messages;
  } catch (error) {
    logger.error(
      {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Conversation compression failed, using original messages'
    );
    compressor.fullCleanup();
    return messages;
  }
}

/**
 * Build a summary message for compressed conversation content
 */
function buildCompressionSummaryMessage(summary: any, artifactIds: string[]): string {
  const parts: string[] = [];

  parts.push('=== CONVERSATION SUMMARY ===');
  parts.push('Previous conversation has been compressed to save context space.');
  parts.push('');

  // Handle conversation_history_summary_v1 schema
  if (summary.conversation_overview) {
    parts.push(`📋 Overview: ${summary.conversation_overview}`);
  }

  if (summary.user_goals?.primary) {
    parts.push(`🎯 Primary Goal: ${summary.user_goals.primary}`);
    if (summary.user_goals.secondary && summary.user_goals.secondary.length > 0) {
      parts.push(`🎯 Secondary Goals:`);
      for (const goal of summary.user_goals.secondary) {
        parts.push(`  • ${goal}`);
      }
    }
  }

  if (summary.key_outcomes) {
    if (summary.key_outcomes.completed && summary.key_outcomes.completed.length > 0) {
      parts.push(`✅ Completed:`);
      for (const item of summary.key_outcomes.completed) {
        parts.push(`  • ${item}`);
      }
    }

    if (summary.key_outcomes.discoveries && summary.key_outcomes.discoveries.length > 0) {
      parts.push(`💡 Key Discoveries:`);
      for (const discovery of summary.key_outcomes.discoveries) {
        parts.push(`  • ${discovery}`);
      }
    }

    if (summary.key_outcomes.partial && summary.key_outcomes.partial.length > 0) {
      parts.push(`⏳ In Progress:`);
      for (const item of summary.key_outcomes.partial) {
        parts.push(`  • ${item}`);
      }
    }
  }

  if (summary.context_for_continuation) {
    if (summary.context_for_continuation.current_state) {
      parts.push(`📍 Current State: ${summary.context_for_continuation.current_state}`);
    }

    if (
      summary.context_for_continuation.next_logical_steps &&
      summary.context_for_continuation.next_logical_steps.length > 0
    ) {
      parts.push(`📝 Next Steps:`);
      for (const step of summary.context_for_continuation.next_logical_steps) {
        parts.push(`  • ${step}`);
      }
    }

    if (
      summary.context_for_continuation.important_context &&
      summary.context_for_continuation.important_context.length > 0
    ) {
      parts.push(`🔑 Key Context:`);
      for (const context of summary.context_for_continuation.important_context) {
        parts.push(`  • ${context}`);
      }
    }
  }

  // Handle technical context if present
  if (summary.technical_context) {
    if (
      summary.technical_context.technologies &&
      summary.technical_context.technologies.length > 0
    ) {
      parts.push(`🔧 Technologies: ${summary.technical_context.technologies.join(', ')}`);
    }

    if (
      summary.technical_context.issues_encountered &&
      summary.technical_context.issues_encountered.length > 0
    ) {
      parts.push(`⚠️ Issues Encountered:`);
      for (const issue of summary.technical_context.issues_encountered) {
        parts.push(`  • ${issue}`);
      }
    }

    if (
      summary.technical_context.solutions_applied &&
      summary.technical_context.solutions_applied.length > 0
    ) {
      parts.push(`✨ Solutions Applied:`);
      for (const solution of summary.technical_context.solutions_applied) {
        parts.push(`  • ${solution}`);
      }
    }
  }

  // Fallback: handle old conversation_summary_v1 schema for backward compatibility
  if (summary.high_level) {
    parts.push(`📋 Overview: ${summary.high_level}`);
  }

  if (summary.user_intent) {
    parts.push(`🎯 User Goal: ${summary.user_intent}`);
  }

  if (summary.decisions && summary.decisions.length > 0) {
    parts.push(`✅ Key Decisions Made:`);
    for (const decision of summary.decisions) {
      parts.push(`  • ${decision}`);
    }
  }

  if (summary.next_steps && summary.next_steps.length > 0) {
    parts.push(`📝 Planned Next Steps:`);
    for (const step of summary.next_steps) {
      parts.push(`  • ${step}`);
    }
  }

  if (summary.open_questions && summary.open_questions.length > 0) {
    parts.push(`❓ Outstanding Questions:`);
    for (const question of summary.open_questions) {
      parts.push(`  • ${question}`);
    }
  }

  // Handle conversation artifacts with detailed information and proper reference format
  if (summary.conversation_artifacts && summary.conversation_artifacts.length > 0) {
    parts.push(
      `💾 Research Artifacts: ${summary.conversation_artifacts.length} created from previous work`
    );
    summary.conversation_artifacts.forEach((artifact: any) => {
      parts.push(`   [ARTIFACT: ${artifact.id}]`);
      parts.push(`   📋 ${artifact.name || 'Research Data'}`);
      if (artifact.content_summary) {
        parts.push(`   📝 ${artifact.content_summary}`);
      }
      if (artifact.tool_name && artifact.tool_name !== 'unknown') {
        parts.push(`   🔧 Source: ${artifact.tool_name}`);
      }
      parts.push(
        `   🔗 Reference: <artifact:ref id="${artifact.id}" tool_call_id="${artifact.tool_call_id}" />`
      );
      parts.push('');
    });
  } else if (artifactIds && artifactIds.length > 0) {
    // Fallback for legacy format
    parts.push(`💾 Research Artifacts: ${artifactIds.length} created from previous work`);
    artifactIds.forEach((artifactId: string) => {
      parts.push(`   [ARTIFACT: ${artifactId}]`);
      parts.push(`   🔗 Reference: <artifact:ref id="${artifactId}" />`);
    });
  }

  parts.push('');
  parts.push('=== END SUMMARY ===');
  parts.push('Recent conversation continues below...');

  return parts.join('\n');
}

/**
 * Reconstruct message text from multi-part content, converting artifact data parts to `<artifact:ref>` tags.
 * Falls back to `content.text` for simple messages.
 */
export function reconstructMessageText(msg: any): string {
  const parts = msg.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return msg.content?.text ?? '';
  }

  return parts
    .map((part: any) => {
      if (part.type === 'text') {
        return part.text ?? '';
      }
      if (part.type === 'data') {
        try {
          const data = typeof part.data === 'string' ? JSON.parse(part.data) : part.data;
          if (data?.artifactId && data?.toolCallId) {
            return `<artifact:ref id="${data.artifactId}" tool="${data.toolCallId}" />`;
          }
        } catch {
          // ignore unparseable data parts
        }
      }
      return '';
    })
    .join('');
}

function formatMessagesAsConversationHistory(messages: any[]): string {
  const formattedHistory = messages
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
      } else if (msg.role === 'system') {
        roleLabel = 'system';
      } else {
        roleLabel = msg.role || 'system';
      }

      return `${roleLabel}: """${reconstructMessageText(msg)}"""`;
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

    const visibleTaskIds = visibleMessages
      .map((msg) => msg.taskId)
      .filter((taskId): taskId is string => Boolean(taskId)); // Filter out null/undefined taskIds

    const referenceArtifacts: Artifact[] = [];
    for (const taskId of visibleTaskIds) {
      const artifacts = await getLedgerArtifacts(runDbClient)({
        scopes: { tenantId, projectId },
        taskId: taskId,
      });
      referenceArtifacts.push(...artifacts);
    }

    // Apply artifact count limit to prevent system prompt bloat
    const ARTIFACT_COUNT_LIMIT = CONVERSATION_ARTIFACTS_LIMIT;
    const limitedArtifacts = referenceArtifacts
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) // Most recent first
      .slice(0, ARTIFACT_COUNT_LIMIT); // Take only the most recent N artifacts

    logger.debug(
      {
        conversationId,
        visibleMessages: visibleMessages.length,
        visibleTasks: visibleTaskIds.length,
        totalArtifacts: referenceArtifacts.length,
        limitedArtifacts: limitedArtifacts.length,
        artifactLimit: ARTIFACT_COUNT_LIMIT,
        historyMode: historyConfig.mode,
      },
      'Loaded conversation-scoped artifacts with count limit'
    );

    return limitedArtifacts;
  } catch (error) {
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
