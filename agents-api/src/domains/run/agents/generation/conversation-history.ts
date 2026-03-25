import type { FilePart } from '@inkeep/agents-core';
import { normalizeMimeType } from '@inkeep/agents-core/constants/allowed-file-formats';
import { getLogger } from '../../../../logger';
import {
  createDefaultConversationHistoryConfig,
  formatMessagesAsConversationHistory,
  getConversationHistoryWithCompression,
} from '../../data/conversations';
import {
  type ContextBreakdown,
  calculateBreakdownTotal,
  estimateTokens,
} from '../../utils/token-estimator';
import type { AgentRunContext, AiSdkContentPart } from '../agent-types';
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

  if (mimeType === PDF_MEDIA_TYPE) {
    return {
      type: 'file',
      data: fileValue,
      mediaType: PDF_MEDIA_TYPE,
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
): Promise<{ conversationHistory: string; contextBreakdown: ContextBreakdown }> {
  let conversationHistory = '';
  const historyConfig =
    ctx.config.conversationHistoryConfig ?? createDefaultConversationHistoryConfig();

  if (historyConfig && historyConfig.mode !== 'none') {
    if (historyConfig.mode === 'full') {
      const filters = {
        delegationId: ctx.delegationId,
        isDelegated: ctx.isDelegatedAgent,
      };

      const historyMessages = await getConversationHistoryWithCompression({
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
      conversationHistory = formatMessagesAsConversationHistory(historyMessages);
    } else if (historyConfig.mode === 'scoped') {
      const historyMessages = await getConversationHistoryWithCompression({
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
      conversationHistory = formatMessagesAsConversationHistory(historyMessages);
    }
  }

  const conversationHistoryTokens = estimateTokens(conversationHistory);
  const updatedContextBreakdown: ContextBreakdown = {
    components: {
      ...initialContextBreakdown.components,
      conversationHistory: conversationHistoryTokens,
    },
    total: initialContextBreakdown.total,
  };

  calculateBreakdownTotal(updatedContextBreakdown);

  return { conversationHistory, contextBreakdown: updatedContextBreakdown };
}

export function buildInitialMessages(
  systemPrompt: string,
  conversationHistory: string,
  userMessage: string,
  fileParts?: FilePart[]
): any[] {
  const messages: any[] = [];
  messages.push({ role: 'system', content: systemPrompt });

  if (conversationHistory.trim() !== '') {
    messages.push({ role: 'user', content: conversationHistory });
  }

  const userContent = buildUserMessageContent(userMessage, fileParts);
  messages.push({
    role: 'user',
    content: userContent,
  });

  return messages;
}

export function buildUserMessageContent(
  text: string,
  fileParts?: FilePart[]
): string | AiSdkContentPart[] {
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
