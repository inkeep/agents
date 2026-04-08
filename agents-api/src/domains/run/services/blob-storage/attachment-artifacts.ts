import { type Artifact, addLedgerArtifacts, type Part } from '@inkeep/agents-core';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import type { MessageAttachmentArtifactSource, PersistedMessageUploadContext } from './file-upload';
import { isBlobUri } from './index';

const logger = getLogger('attachment-artifacts');

export type AttachmentArtifactRef = {
  artifactId: string;
  toolCallId: string;
};

function extractContentHashFromBlobUri(blobUri: string): string | null {
  const match = blobUri.match(/sha256-([a-f0-9]{3,64})(?:\.|$)/i);
  return match?.[1] ?? null;
}

function getBinaryType(mimeType: string | undefined): 'image' | 'file' {
  return mimeType?.startsWith('image/') ? 'image' : 'file';
}

function getDefaultAttachmentName(
  source: MessageAttachmentArtifactSource,
  index: number,
  filename?: string
): string {
  if (filename) {
    return filename;
  }

  return source === 'user-message'
    ? `User attachment ${index + 1}`
    : `Tool attachment ${index + 1}`;
}

function buildAttachmentDescription(
  source: MessageAttachmentArtifactSource,
  mimeType: string | undefined
): string {
  const base =
    source === 'user-message' ? 'Binary file attached by the user' : 'Binary file produced by tool';
  return mimeType ? `${base} (${mimeType})` : base;
}

export function buildMessageAttachmentToolCallId(messageId: string): string {
  return `message_attachment:${messageId}`;
}

export async function createAttachmentArtifacts(
  parts: Part[],
  ctx: PersistedMessageUploadContext
): Promise<AttachmentArtifactRef[]> {
  const artifacts: Artifact[] = [];
  const refs: AttachmentArtifactRef[] = [];

  let fileIndex = 0;
  for (const part of parts) {
    if (part.kind !== 'file') {
      continue;
    }

    const file = part.file;
    if (!('uri' in file) || !file.uri || !isBlobUri(file.uri)) {
      continue;
    }

    const filename =
      typeof part.metadata?.filename === 'string' ? part.metadata.filename : undefined;
    const mimeType = file.mimeType || 'application/octet-stream';
    const binaryType = getBinaryType(mimeType);
    const contentHash = extractContentHashFromBlobUri(file.uri);
    const artifactId = contentHash
      ? `attachment_${ctx.messageId}_${contentHash}`
      : `attachment_${ctx.messageId}_${fileIndex + 1}`;

    artifacts.push({
      artifactId,
      type: 'binary_attachment',
      name: getDefaultAttachmentName(ctx.source, fileIndex, filename),
      description: buildAttachmentDescription(ctx.source, mimeType),
      parts: [
        {
          kind: 'data',
          data: {
            summary: {
              filename,
              mimeType,
              binaryType,
              source: ctx.source,
            },
            full: {
              blobUri: file.uri,
              filename,
              mimeType,
              binaryType,
              source: ctx.source,
            },
          },
        },
      ],
      metadata: {
        visibility: 'context',
        role: 'binary_attachment',
        source: ctx.source,
      },
      createdAt: new Date().toISOString(),
    });

    refs.push({ artifactId, toolCallId: ctx.toolCallId });
    fileIndex += 1;
  }

  if (artifacts.length === 0) {
    return [];
  }

  await addLedgerArtifacts(runDbClient)({
    scopes: { tenantId: ctx.tenantId, projectId: ctx.projectId },
    contextId: ctx.conversationId,
    taskId: ctx.taskId,
    toolCallId: ctx.toolCallId,
    artifacts,
  });

  logger.debug(
    {
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      taskId: ctx.taskId,
      toolCallId: ctx.toolCallId,
      source: ctx.source,
      artifactCount: artifacts.length,
    },
    'Created attachment artifacts'
  );

  return refs;
}
