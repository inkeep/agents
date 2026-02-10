import { z } from '@hono/zod-openapi';
import {
  type FilePart,
  FilePartSchema,
  type Part,
  type TextPart,
  TextPartSchema,
} from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { type ContentItem, type ImageContentItem, ImageUrlSchema } from '../types/chat';

const logger = getLogger('message-parts');

const isTextContentItem = (
  item: ContentItem
): item is { type: 'text'; text: string } & ContentItem => {
  return item.type === 'text' && 'text' in item && typeof item.text === 'string';
};

const isImageContentItem = (item: ContentItem): item is ImageContentItem => {
  return (
    item.type === 'image_url' &&
    'image_url' in item &&
    item.image_url != null &&
    ImageUrlSchema.safeParse(item.image_url.url).success
  );
};

const textContentPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
const imageContentPartSchema = z.object({
  type: z.literal('image'),
  text: ImageUrlSchema,
});
const vercelMessageContentPartSchema = z.union([textContentPartSchema, imageContentPartSchema]);

const buildTextPart = (text: string): TextPart => {
  return TextPartSchema.parse({ kind: 'text', text });
};

const parseDataUri = (dataUri: string): { mimeType: string; base64Data: string } | null => {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64Data: match[2],
  };
};

const buildFilePart = (uri: string, options?: { detail?: 'auto' | 'low' | 'high' }): FilePart => {
  const parsed = parseDataUri(uri);

  if (parsed) {
    return FilePartSchema.parse({
      kind: 'file',
      file: {
        bytes: parsed.base64Data,
        mimeType: parsed.mimeType,
      },
      ...(options?.detail && { metadata: { detail: options.detail } }),
    });
  }

  try {
    new URL(uri);
  } catch {
    throw new Error(`Invalid image URI: expected valid data URI or HTTP URL`);
  }

  return FilePartSchema.parse({
    kind: 'file',
    file: { uri, mimeType: 'image/*' },
    ...(options?.detail && { metadata: { detail: options.detail } }),
  });
};

export const extractTextFromParts = (parts: Part[]): string => {
  return parts
    .filter((p): p is TextPart => p.kind === 'text')
    .map((p) => p.text)
    .join(' ');
};

export const getMessagePartsFromOpenAIContent = (content: string | ContentItem[]): Part[] => {
  if (typeof content === 'string') {
    return [buildTextPart(content)];
  }

  const textChunks: string[] = [];
  const imageParts: FilePart[] = [];
  let skipped = 0;

  for (const item of content) {
    if (isTextContentItem(item)) {
      textChunks.push(item.text);
    } else if (isImageContentItem(item)) {
      imageParts.push(buildFilePart(item.image_url.url, { detail: item.image_url.detail }));
    } else {
      skipped += 1;
    }
  }

  if (skipped > 0) {
    logger.warn(
      { total: content.length, skipped, accepted: content.length - skipped },
      'Some content items were dropped due to invalid or unsupported type'
    );
  }

  return [...(textChunks.length > 0 ? [buildTextPart(textChunks.join(' '))] : []), ...imageParts];
};

export const getMessagePartsFromVercelContent = (content?: unknown, parts?: unknown[]): Part[] => {
  // Backwards compatibility: if content is a string, return single text part
  if (typeof content === 'string') {
    return [buildTextPart(content)];
  }

  const rawParts = parts ?? [];
  const parsedParts = rawParts
    .map((part) => vercelMessageContentPartSchema.safeParse(part))
    .filter((result) => result.success)
    .map((result) => result.data);

  if (parsedParts.length < rawParts.length) {
    logger.warn(
      { expected: rawParts.length, received: parsedParts.length },
      'Some message parts were dropped due to invalid schema'
    );
  }

  const assertNever = (x: never): never => {
    throw new Error(`Unexpected part type: ${JSON.stringify(x)}`);
  };

  return parsedParts.map((part) => {
    if (part.type === 'text') {
      return buildTextPart(part.text);
    }

    if (part.type === 'image') {
      return buildFilePart(part.text);
    }

    return assertNever(part);
  });
};
