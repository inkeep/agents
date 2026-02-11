import type { MessageContent } from '@inkeep/agents-core';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { fromBlobUri, isBlobUri } from './index';

const logger = getLogger('resolve-blob-uris');

export function resolveMessageBlobUris(content: MessageContent, baseUrl?: string): MessageContent {
  if (!content.parts || content.parts.length === 0) {
    return content;
  }

  const apiBaseUrl = baseUrl || env.INKEEP_AGENTS_API_URL;

  const resolvedParts = content.parts.flatMap((part) => {
    if (part.kind === 'file' && typeof part.data === 'string' && isBlobUri(part.data)) {
      const key = fromBlobUri(part.data);
      const keyParts = key.split('/');
      if (keyParts.length >= 4) {
        const [tenantId, projectId, conversationId, ...mediaParts] = keyParts;
        const mediaKey = mediaParts.join('/');
        const proxyUrl = `${apiBaseUrl}/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}/media/${encodeURIComponent(mediaKey)}`;
        return [{ ...part, data: proxyUrl }];
      }
      logger.error(
        { key },
        'Malformed blob key (expected tenantId/projectId/conversationId/...), filtering part out'
      );
      return [];
    }

    return [part];
  });

  return { ...content, parts: resolvedParts };
}

export function resolveMessagesListBlobUris(
  messages: Array<{ content: MessageContent; [key: string]: any }>,
  baseUrl?: string
): Array<{ content: MessageContent; [key: string]: any }> {
  return messages.map((msg) => ({
    ...msg,
    content: resolveMessageBlobUris(msg.content, baseUrl),
  }));
}
