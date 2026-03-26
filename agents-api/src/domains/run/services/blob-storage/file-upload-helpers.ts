import type { MessageContent, Part } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { downloadExternalFile } from './external-file-downloader';
import { PdfUrlIngestionError } from './file-security-errors';
import {
  hasFileParts,
  makeMessageContentParts,
  type UploadContext,
  uploadPartsFiles,
} from './file-upload';
import { makeSanitizedSourceUrl } from './file-url-security';

const logger = getLogger('file-upload-helpers');

function isRemoteHttpOrHttpsUrl(uri: string): boolean {
  const lower = uri.toLowerCase();
  return lower.startsWith('https://') || lower.startsWith('http://');
}

/**
 * Fetches each remote `application/pdf` file part (http(s) `uri`), replaces it with an inline
 * base64 `bytes` part. Full response bodies are buffered in memory up to the same limit as
 * `downloadExternalFile` (see `MAX_FILE_BYTES`); streaming ingestion is not supported yet.
 */
export async function inlineExternalPdfUrlParts(parts: Part[]): Promise<Part[]> {
  const result: Part[] = [];

  for (const part of parts) {
    if (part.kind !== 'file') {
      result.push(part);
      continue;
    }

    const file = part.file;
    if (
      !('uri' in file) ||
      !file.uri ||
      file.mimeType?.toLowerCase() !== 'application/pdf' ||
      !isRemoteHttpOrHttpsUrl(file.uri)
    ) {
      result.push(part);
      continue;
    }

    try {
      const downloaded = await downloadExternalFile(file.uri, {
        expectedMimeType: 'application/pdf',
      });

      result.push({
        kind: 'file',
        file: {
          bytes: Buffer.from(downloaded.data).toString('base64'),
          mimeType: downloaded.mimeType,
        },
        metadata: {
          ...(part.metadata || {}),
          sourceUrl: makeSanitizedSourceUrl(file.uri),
        },
      });
    } catch (error) {
      throw new PdfUrlIngestionError(makeSanitizedSourceUrl(file.uri), {
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return result;
}

export async function buildPersistedMessageContent(
  text: string,
  parts: Part[],
  ctx: UploadContext
): Promise<MessageContent> {
  if (!hasFileParts(parts)) {
    return { text };
  }

  try {
    const uploadedParts = await uploadPartsFiles(parts, ctx);
    const contentParts = makeMessageContentParts(uploadedParts);

    logger.debug(
      {
        messageId: ctx.messageId,
        originalParts: parts.length,
        uploadedParts: contentParts.length,
        fileParts: contentParts.filter((p) => p.kind === 'file').length,
      },
      'Built persisted message content with uploaded files'
    );

    return { text, parts: contentParts };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        messageId: ctx.messageId,
      },
      'Failed to upload files, persisting text only'
    );
    return { text };
  }
}
