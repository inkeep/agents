import type { MessageContent } from '@inkeep/agents-core';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { fromBlobUri, isBlobUri } from './index';

const logger = getLogger('resolve-blob-uris');

export function blobUriToProxyUrl(blobUri: string, baseUrl?: string): string | null {
  const apiBaseUrl = baseUrl || env.INKEEP_AGENTS_API_URL;
  const key = fromBlobUri(blobUri);
  const keyParts = key.split('/');
  if (keyParts.length >= 4) {
    const [tenantId, projectId, conversationId, ...mediaParts] = keyParts;
    const mediaKey = mediaParts.join('/');
    return `${apiBaseUrl}/manage/tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}/media/${encodeURIComponent(mediaKey)}`;
  }
  logger.error(
    { key },
    'Malformed blob key (expected tenantId/projectId/conversationId/...), cannot resolve'
  );
  return null;
}

export function resolveMessageBlobUris(content: MessageContent, baseUrl?: string): MessageContent {
  if (!content.parts || content.parts.length === 0) {
    return content;
  }

  const resolvedParts = content.parts.flatMap((part) => {
    if (part.kind === 'file' && typeof part.data === 'string' && isBlobUri(part.data)) {
      const proxyUrl = blobUriToProxyUrl(part.data, baseUrl);
      if (proxyUrl) {
        return [{ ...part, data: proxyUrl }];
      }
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
