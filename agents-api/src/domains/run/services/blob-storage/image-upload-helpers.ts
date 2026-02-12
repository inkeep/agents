import type { MessageContent, Part } from '@inkeep/agents-core';
import { getLogger } from '../../../../logger';
import { hasFileParts, partsToMessageContentParts, uploadPartsImages } from './image-upload';

const logger = getLogger('image-upload-helpers');

interface PersistContext {
  tenantId: string;
  projectId: string;
  conversationId: string;
  messageId: string;
}

interface PersistedMessageResult {
  content: MessageContent;
  uploadedParts: Part[];
}

export async function buildPersistedMessageContent(
  text: string,
  parts: Part[],
  ctx: PersistContext
): Promise<PersistedMessageResult> {
  if (!hasFileParts(parts)) {
    return { content: { text }, uploadedParts: parts };
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

    return { content: { text, parts: contentParts }, uploadedParts };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        messageId: ctx.messageId,
      },
      'Failed to upload images, persisting text only'
    );
    return { content: { text }, uploadedParts: parts };
  }
}
