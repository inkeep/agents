import type { MessageContent, Part } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import {
  hasFileParts,
  makeMessageContentParts,
  type UploadContext,
  uploadPartsFiles,
} from './file-upload';

const logger = getLogger('file-upload-helpers');

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
