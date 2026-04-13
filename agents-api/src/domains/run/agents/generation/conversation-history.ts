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
import { getLogger } from '../../../../logger';
import {
  createDefaultConversationHistoryConfig,
  formatMessagesAsConversationHistory,
  getConversationHistoryWithCompression,
} from '../../data/conversations';
import {
  type BlobStorageDownloadResult,
  fromBlobUri,
  getBlobStorageProvider,
  isBlobUri,
} from '../../services/blob-storage';
import { normalizeInlineFileBytes } from '../../services/blob-storage/file-content-security';
import { UnsupportedTextAttachmentSourceError } from '../../services/blob-storage/file-security-errors';
import {
  buildDecodedTextAttachmentBlock,
  buildTextAttachmentBlock,
  isTextDocumentMimeType,
} from '../../utils/text-document-attachments';
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
      conversationHistory = await formatMessagesAsConversationHistory(historyMessages);
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
      conversationHistory = await formatMessagesAsConversationHistory(historyMessages);
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

async function buildTextAttachmentPart(
  part: FilePart,
  mimeType: string
): Promise<AiSdkContentPart> {
  const filename = typeof part.metadata?.filename === 'string' ? part.metadata.filename : undefined;
  const file = part.file;
  let bytes: Uint8Array;

  if ('bytes' in file && file.bytes) {
    bytes = (await normalizeInlineFileBytes(file)).data;
  } else if ('uri' in file && file.uri && isBlobUri(file.uri)) {
    let downloaded: BlobStorageDownloadResult;
    try {
      downloaded = await getBlobStorageProvider().download(fromBlobUri(file.uri));
    } catch (err) {
      logger.warn(
        { err, uri: file.uri, mimeType, failureKind: 'download' },
        'Failed to download text attachment from blob storage'
      );
      return {
        type: 'text',
        text: buildTextAttachmentBlock({ mimeType, content: '[Attachment unavailable]', filename }),
      };
    }
    bytes = downloaded.data;
  } else {
    throw new UnsupportedTextAttachmentSourceError(mimeType);
  }

  try {
    return {
      type: 'text',
      text: buildDecodedTextAttachmentBlock({ data: bytes, mimeType, filename }),
    };
  } catch (err) {
    logger.warn({ err, mimeType, failureKind: 'decode' }, 'Failed to decode text attachment');
    return {
      type: 'text',
      text: buildTextAttachmentBlock({ mimeType, content: '[Attachment unavailable]', filename }),
    };
  }
}

export async function buildInitialMessages(
  systemPrompt: string,
  conversationHistory: string,
  userMessage: string,
  fileParts?: FilePart[]
): Promise<any[]> {
  const messages: any[] = [];
  messages.push({ role: 'system', content: systemPrompt });

  if (conversationHistory.trim() !== '') {
    messages.push({ role: 'user', content: conversationHistory });
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
      content.push(await buildTextAttachmentPart(part, mimeType));
      continue;
    }

    if (isOfficeDocumentMimeType(mimeType)) {
      content.push({
        type: 'file',
        data: fileValue,
        mediaType: mimeType,
        ...(typeof part.metadata?.filename === 'string'
          ? { filename: part.metadata.filename }
          : {}),
      });
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
