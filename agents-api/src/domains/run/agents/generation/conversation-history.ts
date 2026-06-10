import type { FilePart } from '@inkeep/agents-core';
import {
  type ContextBreakdown,
  calculateBreakdownTotal,
  estimateTokens,
} from '@inkeep/agents-core';
import {
  isOfficeDocumentMimeType,
  normalizeMimeType,
} from '@inkeep/agents-core/constants/allowed-file-formats';
import { isTextDocumentMimeType } from '@inkeep/agents-core/text-attachments';
import { getLogger } from '../../../../logger';
import {
  createDefaultConversationHistoryConfig,
  formatMessagesAsConversationHistorySegments,
  getConversationHistoryWithCompression,
} from '../../data/conversations';
import { resolveTextAttachmentBlock } from '../../services/blob-storage/text-attachment-resolver';
import type { AgentRunContext, AiSdkContentPart } from '../agent-types';
import { INKEEP_CACHE_BOUNDARY_PROP, SYSTEM_CACHE_BOUNDARY_SENTINEL } from './caching-actuator';
import { getPrimaryModel, getSummarizerModel } from './model-config';

const PDF_MEDIA_TYPE = 'application/pdf';
const logger = getLogger('conversation-history');

function mapFileToAiSdkContentPart(
  fileValue: string | URL,
  mimeType: string,
  metadata: { detail?: string; filename?: string } | undefined
): AiSdkContentPart | null {
  if (mimeType.startsWith('image/')) {
    return {
      type: 'image',
      image: fileValue,
      ...(metadata?.detail && {
        experimental_providerMetadata: { openai: { imageDetail: metadata.detail as any } },
      }),
    };
  }

  if (mimeType === PDF_MEDIA_TYPE || isOfficeDocumentMimeType(mimeType)) {
    return {
      type: 'file',
      data: fileValue,
      mediaType: mimeType,
      ...(metadata?.filename ? { filename: metadata.filename } : {}),
    };
  }

  return null;
}

export async function buildConversationHistory(
  ctx: AgentRunContext,
  contextId: string,
  taskId: string,
  userMessage: string,
  streamRequestId: string | undefined,
  initialContextBreakdown: ContextBreakdown
): Promise<{
  conversationHistory: string;
  conversationHistorySegments: string[];
  contextBreakdown: ContextBreakdown;
}> {
  let historyMessages: Awaited<ReturnType<typeof getConversationHistoryWithCompression>> = [];
  const historyConfig =
    ctx.config.conversationHistoryConfig ?? createDefaultConversationHistoryConfig();

  if (historyConfig && historyConfig.mode !== 'none') {
    if (historyConfig.mode === 'full') {
      const filters = {
        delegationId: ctx.delegationId,
        isDelegated: ctx.isDelegatedAgent,
      };

      historyMessages = await getConversationHistoryWithCompression({
        tenantId: ctx.config.tenantId,
        projectId: ctx.config.projectId,
        conversationId: contextId,
        currentMessage: userMessage,
        options: historyConfig,
        filters,
        summarizerModel: getSummarizerModel(ctx.config),
        baseModel: getPrimaryModel(ctx.config),
        streamRequestId,
        fullContextSize: initialContextBreakdown.total,
      });
    } else if (historyConfig.mode === 'scoped') {
      historyMessages = await getConversationHistoryWithCompression({
        tenantId: ctx.config.tenantId,
        projectId: ctx.config.projectId,
        conversationId: contextId,
        currentMessage: userMessage,
        options: historyConfig,
        filters: {
          subAgentId: ctx.config.id,
          taskId: taskId,
          delegationId: ctx.delegationId,
          isDelegated: ctx.isDelegatedAgent,
        },
        summarizerModel: getSummarizerModel(ctx.config),
        baseModel: getPrimaryModel(ctx.config),
        streamRequestId,
        fullContextSize: initialContextBreakdown.total,
      });
    }
  }

  // Per-turn segments for the prompt path (R4); join is byte-identical to the legacy single string.
  const conversationHistorySegments =
    await formatMessagesAsConversationHistorySegments(historyMessages);
  const conversationHistory = conversationHistorySegments.join('');

  const conversationHistoryTokens = estimateTokens(conversationHistory);
  const updatedContextBreakdown: ContextBreakdown = {
    components: {
      ...initialContextBreakdown.components,
      conversationHistory: conversationHistoryTokens,
    },
    total: initialContextBreakdown.total,
  };

  calculateBreakdownTotal(updatedContextBreakdown);

  return {
    conversationHistory,
    conversationHistorySegments,
    contextBreakdown: updatedContextBreakdown,
  };
}

async function buildTextAttachmentPart(part: FilePart): Promise<AiSdkContentPart> {
  return {
    type: 'text',
    text: await resolveTextAttachmentBlock(part, { throwIfUnresolvable: true }),
  };
}

export async function buildInitialMessages(
  systemPrompt: string,
  conversationHistory: string,
  userMessage: string,
  fileParts?: FilePart[],
  artifactsMessage: string | null = null,
  conversationHistorySegments?: string[]
): Promise<any[]> {
  const messages: any[] = [];

  // R3: split the system prompt at the cache boundary into two CONSECUTIVE system blocks —
  // Sub-block A (per-agent stable; the actuator marks it as BP1) and Sub-block B+C (app context +
  // agent/sub-agent prompts; per-conversation). Anthropic maps consecutive system messages to an
  // array of system text blocks, each with its own cacheControl, so the stable prefix caches across
  // an agent's conversations. Without the sentinel (other version configs) it stays one block.
  const [systemStable, systemPerConversation] = systemPrompt.split(SYSTEM_CACHE_BOUNDARY_SENTINEL);
  if (systemStable !== undefined && systemStable.trim() !== '') {
    messages.push({ role: 'system', content: systemStable });
  }
  if (systemPerConversation !== undefined && systemPerConversation.trim() !== '') {
    messages.push({ role: 'system', content: systemPerConversation });
  }

  // R4: emit history as per-message content blocks so a cache breakpoint can sit on the most-recent
  // message; older blocks are stable across turns. The last MESSAGE segment (the one before the
  // `</conversation_history>` close-tag segment) carries an internal boundary tag that the prompt-
  // caching actuator turns into a cacheControl marker (Anthropic) and strips before the wire.
  // Falls back to the legacy single string when segments are absent (preserves existing callers).
  const historySegments = conversationHistorySegments ?? [];
  if (historySegments.length > 0) {
    // The last MESSAGE segment is the one before the `</conversation_history>` close-tag segment
    // (index length-2). Clamp to 0 so a single-segment array (a caller not honoring the close-tag
    // contract) still places the breakpoint on a real block instead of dropping it silently (-1).
    const lastMessageSegmentIndex = Math.max(0, historySegments.length - 2);
    messages.push({
      role: 'user',
      content: historySegments.map((text, i) => ({
        type: 'text',
        text,
        ...(i === lastMessageSegmentIndex ? { [INKEEP_CACHE_BOUNDARY_PROP]: 'history' } : {}),
      })),
    });
  } else if (conversationHistory.trim() !== '') {
    messages.push({ role: 'user', content: conversationHistory });
  }

  if (artifactsMessage && artifactsMessage.trim() !== '') {
    messages.push({ role: 'user', content: artifactsMessage });
  }

  const userContent = await buildUserMessageContent(userMessage, fileParts);
  messages.push({
    role: 'user',
    content: userContent,
  });

  return messages;
}

export async function buildUserMessageContent(
  text: string,
  fileParts?: FilePart[]
): Promise<string | AiSdkContentPart[]> {
  if (!fileParts || fileParts.length === 0) {
    return text;
  }

  const content: AiSdkContentPart[] = [{ type: 'text', text }];

  for (const part of fileParts) {
    const file = part.file;
    const fileValue =
      'uri' in file && file.uri
        ? new URL(file.uri)
        : `data:${file.mimeType || ''};base64,${file.bytes}`;
    const mimeType = normalizeMimeType(file.mimeType ?? '');

    if (isTextDocumentMimeType(mimeType)) {
      content.push(await buildTextAttachmentPart(part));
      continue;
    }

    const mappedPart = mapFileToAiSdkContentPart(fileValue, mimeType, {
      detail: typeof part.metadata?.detail === 'string' ? part.metadata.detail : undefined,
      filename: typeof part.metadata?.filename === 'string' ? part.metadata.filename : undefined,
    });

    if (mappedPart) {
      content.push(mappedPart);
    } else {
      logger.warn({ mimeType, source: 'user-message' }, 'Dropping unsupported file content part');
    }
  }

  return content;
}
