import { createHash } from 'node:crypto';
import type { DataPart, FilePart, MessageContent, Part, TextPart } from '@inkeep/agents-core';
import { getExtensionFromMimeType } from '@inkeep/agents-core/constants/allowed-file-formats';
import { getLogger } from '../../../../logger';
import { downloadExternalFile } from './external-file-downloader';
import { normalizeInlineFileBytes } from './file-content-security';
import { FileSecurityError } from './file-security-errors';
import { makeSanitizedSourceUrl } from './file-url-security';
import { getBlobStorageProvider, toBlobUri } from './index';
import { buildStorageKey } from './storage-keys';

type MessageContentPart = NonNullable<MessageContent['parts']>[number];

const logger = getLogger('file-upload');
const FILE_UPLOAD_CONCURRENCY = 3;

const isRemoteHttpAttachmentUrl = (rawUrl: string): boolean => {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export interface UploadContext {
  tenantId: string;
  projectId: string;
  conversationId: string;
  messageId: string;
}

export type MessageAttachmentArtifactSource = 'user-message' | 'tool-result';

export interface PersistedMessageUploadContext extends UploadContext {
  taskId: string;
  toolCallId: string;
  source: MessageAttachmentArtifactSource;
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
    const normalized = await normalizeInlineFileBytes(file);
    data = normalized.data;
    mimeType = normalized.mimeType;
  } else if ('uri' in file && file.uri) {
    const downloaded = await downloadExternalFile(file.uri, {
      expectedMimeType: file.mimeType,
    });
    data = downloaded.data;
    mimeType = downloaded.mimeType;
  } else {
    logger.warn({ index }, 'FilePart has neither bytes nor uri, skipping upload');
    return part;
  }

  const contentHash = createHash('sha256').update(data).digest('hex');
  const ext = getExtensionFromMimeType(mimeType);
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

  logger.debug({ key, mimeType, size: data.length }, 'Uploaded file to blob storage');

  const remoteAttachmentSourceUrl =
    'uri' in file && file.uri && isRemoteHttpAttachmentUrl(file.uri) ? file.uri : undefined;

  return {
    kind: 'file',
    file: {
      uri: toBlobUri(key),
      mimeType,
    },
    ...(part.metadata || remoteAttachmentSourceUrl
      ? {
          metadata: {
            ...(part.metadata || {}),
            ...(remoteAttachmentSourceUrl
              ? { sourceUrl: makeSanitizedSourceUrl(remoteAttachmentSourceUrl) }
              : {}),
          },
        }
      : {}),
  };
}

export async function uploadPartsFiles(parts: Part[], ctx: UploadContext): Promise<Part[]> {
  const results: Array<Part | null> = parts.map((part) => (part.kind === 'file' ? null : part));
  const fileIndices = parts.flatMap((part, index) => (part.kind === 'file' ? [index] : []));

  let nextFileCursor = 0;
  const workerCount = Math.min(FILE_UPLOAD_CONCURRENCY, fileIndices.length);

  const worker = async () => {
    while (nextFileCursor < fileIndices.length) {
      const fileCursor = nextFileCursor;
      nextFileCursor += 1;
      const index = fileIndices[fileCursor];
      const part = parts[index];

      if (!part || part.kind !== 'file') {
        continue;
      }

      try {
        const uploaded = await uploadFilePart(part, ctx, index);
        results[index] = uploaded;
      } catch (error) {
        if (error instanceof FileSecurityError) {
          throw error;
        }
        const file =
          part.kind === 'file'
            ? {
                ...(part.file.mimeType ? { mimeType: part.file.mimeType } : {}),
                ...('uri' in part.file && part.file.uri ? { uri: part.file.uri } : {}),
                ...('bytes' in part.file && part.file.bytes
                  ? { bytesLength: part.file.bytes.length }
                  : {}),
              }
            : undefined;
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            index,
            tenantId: ctx.tenantId,
            projectId: ctx.projectId,
            conversationId: ctx.conversationId,
            messageId: ctx.messageId,
            file,
          },
          'Failed to upload file part, dropping from persisted message to avoid storing base64 in DB'
        );
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.filter((part): part is Part => part !== null);
}

export function makeMessageContentParts(parts: Part[]): MessageContentPart[] {
  const result: MessageContentPart[] = [];

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
      result.push({ kind: part.kind, data: (part as DataPart).data, metadata: part.metadata });
    }
  }

  return result;
}

export function hasFileParts(parts: Part[]): boolean {
  return parts.some((p) => p.kind === 'file');
}
