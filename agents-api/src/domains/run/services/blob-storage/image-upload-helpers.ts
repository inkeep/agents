import type { MessageContent, Part } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import {
  hasFileParts,
  partsToMessageContentParts,
  uploadPartsImages,
  type UploadContext,
} from './image-upload';

const logger = getLogger('image-upload-helpers');

export async function buildPersistedMessageContent(
  text: string,
  parts: Part[],
  ctx: UploadContext
): Promise<MessageContent> {
  if (!hasFileParts(parts)) {
    return { text };
  }

  try {
    const uploadedParts = await uploadPartsImages(parts, ctx);
    const contentParts = partsToMessageContentParts(uploadedParts);

    logger.debug(
      {
        messageId: ctx.messageId,
        originalParts: parts.length,
        uploadedParts: contentParts.length,
        fileParts: contentParts.filter((p) => p.kind === 'file').length,
      },
      'Built persisted message content with uploaded images'
    );

    return { text, parts: contentParts };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        messageId: ctx.messageId,
      },
      'Failed to upload images, persisting text only'
    );
    return { text };
  }
}
