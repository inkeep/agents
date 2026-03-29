import type { MessageContent } from '@inkeep/agents-core';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { fromBlobUri, isBlobUri } from './index';
import { parseMediaStorageKey } from './storage-keys';

const logger = getLogger('resolve-blob-uris');

export function resolveMessageBlobUris(content: MessageContent, baseUrl?: string): MessageContent {
  if (!content.parts || content.parts.length === 0) {
    return content;
  }

  const apiBaseUrl = baseUrl || env.INKEEP_AGENTS_API_URL;

  const resolvedParts = content.parts.flatMap((part) => {
    if (part.kind === 'file' && typeof part.data === 'string' && isBlobUri(part.data)) {
      const key = fromBlobUri(part.data);
      const parsed = parseMediaStorageKey(key);
      if (parsed) {
        const proxyUrl = `${apiBaseUrl}/manage/tenants/${parsed.tenantId}/projects/${parsed.projectId}/conversations/${parsed.conversationId}/media/${encodeURIComponent(parsed.tail)}`;
        return [{ ...part, data: proxyUrl }];
      }
      logger.warn({ key }, 'Malformed blob storage key, filtering part out');
      return [];
    }

    return [part];
  });

  return { ...content, parts: resolvedParts };
}

export function resolveMessagesListBlobUris<T extends { content: MessageContent }>(
  messages: T[],
  baseUrl?: string
): T[] {
  return messages.map((msg) => ({
    ...msg,
    content: resolveMessageBlobUris(msg.content, baseUrl),
  }));
}
