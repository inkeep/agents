import type { FilePart } from '@inkeep/agents-core';
import {
  createDefaultConversationHistoryConfig,
  getConversationHistoryWithCompression,
} from '../../data/conversations';
import {
  type ContextBreakdown,
  calculateBreakdownTotal,
  estimateTokens,
} from '../../utils/token-estimator';
import type { AgentRunContext, AiSdkContentPart } from '../agent-types';
import { getPrimaryModel, getSummarizerModel } from './model-config';

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

      conversationHistory = await getConversationHistoryWithCompression({
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
      conversationHistory = await getConversationHistoryWithCompression({
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
  imageParts?: FilePart[]
): any[] {
  const messages: any[] = [];
  messages.push({ role: 'system', content: systemPrompt });

  if (conversationHistory.trim() !== '') {
    messages.push({ role: 'user', content: conversationHistory });
  }

  const userContent = buildUserMessageContent(userMessage, imageParts);
  messages.push({
    role: 'user',
    content: userContent,
  });

  return messages;
}

export function buildUserMessageContent(
  text: string,
  imageParts?: FilePart[]
): string | AiSdkContentPart[] {
  if (!imageParts || imageParts.length === 0) {
    return text;
  }

  const content: AiSdkContentPart[] = [{ type: 'text', text }];

  for (const part of imageParts) {
    const file = part.file;
    const imageValue =
      'uri' in file && file.uri
        ? new URL(file.uri)
        : `data:${file.mimeType || 'image/*'};base64,${file.bytes}`;

    const imagePart: AiSdkContentPart = {
      type: 'image',
      image: imageValue,
      ...(part.metadata?.detail && {
        experimental_providerMetadata: { openai: { imageDetail: part.metadata.detail } },
      }),
    };

    content.push(imagePart);
  }

  return content;
}
