import type { MessageContent, Part } from '@inkeep/agents-core';
import { normalizeMimeType } from '@inkeep/agents-core/constants/allowed-file-formats';
import { getLogger } from '../../../../logger';
import { isTextDocumentMimeType } from '../../utils/text-document-attachments';
import { type AttachmentArtifactRef, createAttachmentArtifacts } from './attachment-artifacts';
import { downloadExternalFile } from './external-file-downloader';
import { FileSecurityError, PdfUrlIngestionError } from './file-security-errors';
import {
  hasFileParts,
  makeMessageContentParts,
  type PersistedMessageUploadContext,
  uploadPartsFiles,
} from './file-upload';
import { makeSanitizedSourceUrl } from './file-url-security';
import { resolveTextAttachmentBlock } from './text-attachment-resolver';

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

/**
 * Stamp each uploaded file part with the matching artifact's `artifactId` + `toolCallId`
 * (correlated by blob URI) so downstream persistence and history rebuilds can emit a
 * self-describing `<attached_file ... artifact_id="..." tool_call_id="..." />` marker that
 * carries everything needed to fetch the artifact.
 */
export function attachArtifactRefsToFileParts(
  parts: Part[],
  refs: AttachmentArtifactRef[]
): Part[] {
  if (refs.length === 0) {
    return parts;
  }
  const refsByBlobUri = new Map(refs.map((ref) => [ref.blobUri, ref]));
  return parts.map((part) => {
    if (part.kind !== 'file') return part;
    const file = part.file;
    if (!('uri' in file) || !file.uri) return part;
    const ref = refsByBlobUri.get(file.uri);
    if (!ref) return part;
    return {
      ...part,
      metadata: {
        ...(part.metadata || {}),
        artifactId: ref.artifactId,
        toolCallId: ref.toolCallId,
      },
    };
  });
}

export async function expandTextFilePartsWithDecodedText(parts: Part[]): Promise<Part[]> {
  const result: Part[] = [];
  for (const part of parts) {
    if (part.kind !== 'file') {
      result.push(part);
      continue;
    }
    const mimeType = normalizeMimeType(part.file.mimeType ?? '');
    if (!isTextDocumentMimeType(mimeType)) {
      result.push(part);
      continue;
    }
    const textBlock = await resolveTextAttachmentBlock(part);
    result.push({ kind: 'text', text: textBlock });
    result.push(part);
  }
  return result;
}

export async function buildPersistedMessageContent(
  text: string,
  parts: Part[],
  ctx: PersistedMessageUploadContext & { skipArtifactCreation?: boolean }
): Promise<MessageContent> {
  if (!hasFileParts(parts)) {
    return { text };
  }

  try {
    const uploadedParts = await uploadPartsFiles(parts, ctx);
    const attachmentRefs = ctx.skipArtifactCreation
      ? []
      : await createAttachmentArtifacts(uploadedParts, ctx);
    const partsWithArtifactIds = attachArtifactRefsToFileParts(uploadedParts, attachmentRefs);
    const expandedParts = await expandTextFilePartsWithDecodedText(partsWithArtifactIds);
    const contentParts = makeMessageContentParts(expandedParts);
    const persistedParts = [
      ...contentParts,
      ...attachmentRefs.map((ref) => ({
        kind: 'data' as const,
        data: {
          artifactId: ref.artifactId,
          toolCallId: ref.toolCallId,
        },
      })),
    ];

    logger.debug(
      {
        messageId: ctx.messageId,
        originalParts: parts.length,
        uploadedParts: persistedParts.length,
        fileParts: contentParts.filter((p) => p.kind === 'file').length,
        attachmentArtifactRefs: attachmentRefs.length,
      },
      'Built persisted message content with uploaded files'
    );

    return { text, parts: persistedParts };
  } catch (error) {
    if (error instanceof FileSecurityError) {
      throw error;
    }
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
