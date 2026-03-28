import type { MessageContent } from '@inkeep/agents-core';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { fromBlobUri, getBlobStorageProvider, isBlobUri } from './index';
import { parseMediaStorageKey } from './storage-keys';

const logger = getLogger('resolve-blob-uris');

export async function resolveMessageBlobUris(
  content: MessageContent,
  baseUrl?: string
): Promise<MessageContent> {
  if (!content.parts || content.parts.length === 0) {
    return content;
  }

  const provider = getBlobStorageProvider();
  const apiBaseUrl = baseUrl || env.INKEEP_AGENTS_API_URL;

  const resolvedParts = await Promise.all(
    content.parts.map(async (part) => {
      if (part.kind === 'file' && typeof part.data === 'string' && isBlobUri(part.data)) {
        const key = fromBlobUri(part.data);

        if (provider.getPresignedUrl) {
          try {
            const presignedUrl = await provider.getPresignedUrl(key);
            return { ...part, data: presignedUrl };
          } catch (error) {
            logger.warn(
              { key, error },
              'Presigned URL generation failed, falling back to proxy URL'
            );
          }
        }

        const parsed = parseMediaStorageKey(key);
        if (parsed) {
          const proxyUrl = `${apiBaseUrl}/manage/tenants/${parsed.tenantId}/projects/${parsed.projectId}/conversations/${parsed.conversationId}/media/${encodeURIComponent(parsed.tail)}`;
          return { ...part, data: proxyUrl };
        }
        logger.warn({ key }, 'Malformed blob storage key, filtering part out');
        return null;
      }

      return part;
    })
  );

  return {
    ...content,
    parts: resolvedParts.filter((p): p is NonNullable<typeof p> => p !== null),
  };
}

export async function resolveMessagesListBlobUris<T extends { content: MessageContent }>(
  messages: T[],
  baseUrl?: string
): Promise<T[]> {
  return Promise.all(
    messages.map(async (msg) => ({
      ...msg,
      content: await resolveMessageBlobUris(msg.content, baseUrl),
    }))
  );
}
