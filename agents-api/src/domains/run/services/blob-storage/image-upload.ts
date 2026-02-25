import { createHash } from 'node:crypto';
import type { FilePart, Part, TextPart } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { downloadExternalImage } from './external-image-downloader';
import { normalizeInlineImageBytes } from './image-content-security';
import { getBlobStorageProvider, toBlobUri } from './index';
import { buildStorageKey } from './storage-keys';

const logger = getLogger('image-upload');

export interface UploadContext {
  tenantId: string;
  projectId: string;
  conversationId: string;
  messageId: string;
}

function getExtensionFromMimeType(mimeType?: string): string {
  if (!mimeType) return 'bin';
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/*': 'bin',
  };
  return map[mimeType] || mimeType.split('/')[1] || 'bin';
}

async function uploadFilePart(
  part: FilePart,
  ctx: UploadContext,
  index: number
): Promise<FilePart> {
  const storage = getBlobStorageProvider();
  const file = part.file;

  let data: Uint8Array;
  let mimeType: string;

  if ('bytes' in file && file.bytes) {
    const normalized = await normalizeInlineImageBytes(file);
    data = normalized.data;
    mimeType = normalized.mimeType;
  } else if ('uri' in file && file.uri) {
    const downloaded = await downloadExternalImage(file.uri);
    data = downloaded.data;
    mimeType = downloaded.mimeType;
  } else {
    logger.warn({ index }, 'FilePart has neither bytes nor uri, skipping upload');
    return part;
  }

  const contentHash = createHash('sha256').update(data).digest('hex');
  const ext = getExtensionFromMimeType(mimeType.split(';')[0]?.trim().toLowerCase());
  const key = buildStorageKey({
    category: 'media',
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    conversationId: ctx.conversationId,
    messageId: ctx.messageId,
    contentHash,
    ext,
  });

  await storage.upload({ key, data, contentType: mimeType });

  logger.debug({ key, mimeType, size: data.length }, 'Uploaded image to blob storage');

  return {
    kind: 'file',
    file: {
      uri: toBlobUri(key),
      mimeType,
    },
    ...(part.metadata && { metadata: part.metadata }),
  };
}

export async function uploadPartsImages(parts: Part[], ctx: UploadContext): Promise<Part[]> {
  const results: Part[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.kind === 'file') {
      try {
        const uploaded = await uploadFilePart(part, ctx, i);
        results.push(uploaded);
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error), index: i },
          'Failed to upload image part, dropping from persisted message to avoid storing base64 in DB'
        );
      }
    } else {
      results.push(part);
    }
  }

  return results;
}

export function partsToMessageContentParts(parts: Part[]): Array<{
  kind: string;
  text?: string;
  data?: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}> {
  const result: Array<{
    kind: string;
    text?: string;
    data?: string | Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const part of parts) {
    if (part.kind === 'text') {
      result.push({ kind: 'text', text: (part as TextPart).text });
    } else if (part.kind === 'file') {
      const filePart = part as FilePart;
      const file = filePart.file;
      if ('uri' in file && file.uri) {
        result.push({
          kind: 'file',
          data: file.uri,
          metadata: {
            ...(file.mimeType && { mimeType: file.mimeType }),
            ...(filePart.metadata && { ...filePart.metadata }),
          },
        });
      } else {
        logger.warn(
          {},
          'Skipping file part without URI — raw bytes must not be persisted to the database'
        );
      }
    } else {
      result.push({ kind: part.kind, data: (part as any).data, metadata: part.metadata });
    }
  }

  return result;
}

export function hasFileParts(parts: Part[]): boolean {
  return parts.some((p) => p.kind === 'file');
}
