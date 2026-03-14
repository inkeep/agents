import type { FilePart, MessageSelect } from '@inkeep/agents-core';
import type { ModelMessage } from 'ai';
import {
  createDefaultConversationHistoryConfig,
  formatMessagesAsConversationHistory,
  getConversationHistoryWithCompression,
} from '../../data/conversations';
import type { HydrateBlobToDataUrl } from '../../services/blob-storage';
import { isBlobUri } from '../../services/blob-storage';
import {
  type ContextBreakdown,
  calculateBreakdownTotal,
  estimateTokens,
} from '../../utils/token-estimator';
import type { AgentRunContext, AiSdkContentPart } from '../agent-types';
import { getPrimaryModel, getSummarizerModel } from './model-config';

export async function hydrateConversationHistoryBlobParts(
  messages: MessageSelect[],
  hydrate: HydrateBlobToDataUrl
): Promise<{ hydrated: MessageSelect[]; nonHydrated: MessageSelect[] }> {
  const hydratedResults = await Promise.all(
    messages.map(async (msg): Promise<{ message: MessageSelect; hydrated: boolean }> => {
      const content = msg.content;
      if (!content?.parts?.length) {
        return { message: msg, hydrated: false };
      }

      let hasHydratedParts = false;
      const parts = await Promise.all(
        content.parts.map(async (part: NonNullable<MessageSelect['content']['parts']>[number]) => {
          if (part.kind !== 'file' || typeof part.data !== 'string' || !isBlobUri(part.data)) {
            return part;
          }
          const mimeType =
            typeof part.metadata?.mimeType === 'string' ? part.metadata.mimeType : undefined;
          const dataUrl = await hydrate(part.data, mimeType);
          if (dataUrl) {
            hasHydratedParts = true;
            return { ...part, data: dataUrl };
          }
          return part;
        })
      );

      const processedMsg = { ...msg, content: { ...content, parts } };
      return { message: processedMsg, hydrated: hasHydratedParts };
    })
  );

  const hydrated = hydratedResults
    .filter((result) => result.hydrated)
    .map((result) => result.message);
  const nonHydrated = hydratedResults
    .filter((result) => !result.hydrated)
    .map((result) => result.message);

  return { hydrated, nonHydrated };
}

export async function buildConversationHistory({
  ctx,
  contextId,
  taskId,
  userMessage,
  streamRequestId,
  initialContextBreakdown,
}: {
  ctx: AgentRunContext;
  contextId: string;
  taskId: string;
  userMessage: string;
  streamRequestId: string | undefined;
  initialContextBreakdown: ContextBreakdown;
}): Promise<{
  conversationHistoryWithFileData: MessageSelect[];
  conversationHistoryString: string;
  contextBreakdown: ContextBreakdown;
}> {
  let conversationHistory: MessageSelect[] = [];
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

  let conversationHistoryWithFileData: MessageSelect[] = [];
  if (ctx.hydrateBlobToDataUrl && conversationHistory.length > 0) {
    const { hydrated, nonHydrated } = await hydrateConversationHistoryBlobParts(
      conversationHistory,
      ctx.hydrateBlobToDataUrl
    );
    conversationHistoryWithFileData = hydrated;
    conversationHistory = nonHydrated;
  }

  const conversationHistoryString = formatMessagesAsConversationHistory(conversationHistory);

  const hydratedHistoryWithFileData = conversationHistoryWithFileData
    .flatMap((msg) => msg.content?.parts ?? [])
    .map((part) => {
      if (part.kind === 'text' && typeof part.text === 'string') {
        return part.text;
      }
      if (part.kind === 'file' && typeof part.data === 'string') {
        return part.data;
      }
      return '';
    })
    .join('\n');
  const conversationHistoryTokens =
    estimateTokens(conversationHistoryString) + estimateTokens(hydratedHistoryWithFileData);
  const updatedContextBreakdown: ContextBreakdown = {
    components: {
      ...initialContextBreakdown.components,
      conversationHistory: conversationHistoryTokens,
    },
    total: initialContextBreakdown.total,
  };

  calculateBreakdownTotal(updatedContextBreakdown);

  return {
    conversationHistoryWithFileData,
    conversationHistoryString,
    contextBreakdown: updatedContextBreakdown,
  };
}

export function buildInitialMessages({
  systemPrompt,
  conversationHistory,
  userMessage,
  imageParts,
  conversationHistoryWithFileData,
}: {
  systemPrompt: string;
  conversationHistory: string;
  userMessage: string;
  imageParts?: FilePart[];
  conversationHistoryWithFileData?: MessageSelect[];
}): ModelMessage[] {
  const messages: ModelMessage[] = [];
  messages.push({ role: 'system', content: systemPrompt });

  if (conversationHistory.trim() !== '') {
    messages.push({ role: 'user', content: conversationHistory });
  }

  if (conversationHistoryWithFileData?.length) {
    conversationHistoryWithFileData.forEach((msg) => {
      const content = (msg.content?.parts ?? []).reduce<AiSdkContentPart[]>((acc, part) => {
        if (part.kind === 'text' && typeof part.text === 'string') {
          acc.push({ type: 'text', text: part.text });
          return acc;
        }

        if (part.kind === 'file' && typeof part.data === 'string') {
          // Temporarily hard code to image. Must update when we add other file types.
          acc.push({ type: 'image', image: part.data });
          return acc;
        }

        return acc;
      }, []);

      if (content?.length && content.length > 0) {
        messages.push({ role: 'user', content });
      }
    });
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
