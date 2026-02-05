import { z } from '@hono/zod-openapi';
import type { FilePart, Part, TextPart } from '@inkeep/agents-core';
import type { ContentItem } from '../types/chat';

export const imageUrlSchema = z.union([
  z.httpUrl(),
  z
    .string()
    .regex(
      /^data:image\/(png|jpeg|jpg|webp);base64,/,
      'Image must be PNG, JPEG, or WebP format (GIF not supported by all providers)'
    )
    .refine((val) => {
      const base64Part = val.split(',')[1];
      return /^[A-Za-z0-9+/]*={0,2}$/.test(base64Part);
    }, 'Invalid base64 data in image data URI'),
]);

export const isTextContentItem = (
  item: ContentItem
): item is { type: 'text'; text: string } & ContentItem => {
  return item.type === 'text' && 'text' in item && typeof item.text === 'string';
};

export const isImageContentItem = (
  item: ContentItem
): item is { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } } => {
  return (
    item.type === 'image_url' &&
    'image_url' in item &&
    imageUrlSchema.safeParse(item.image_url?.url).success
  );
};

const textContentPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
const imageContentPartSchema = z.object({
  type: z.literal('image'),
  text: imageUrlSchema,
});
const vercelMessageContentPartSchema = z.union([textContentPartSchema, imageContentPartSchema]);

export const buildTextPart = (text: string): TextPart => {
  return { kind: 'text', text };
};

function parseDataUri(dataUri: string): { mimeType: string; base64Data: string } | null {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

export const buildFilePart = (
  uri: string,
  options?: { detail?: 'auto' | 'low' | 'high' }
): FilePart => {
  const parsed = parseDataUri(uri);

  if (parsed) {
    return {
      kind: 'file',
      file: {
        bytes: parsed.base64Data,
        mimeType: parsed.mimeType,
      },
      ...(options?.detail && { metadata: { detail: options.detail } }),
    };
  }

  return {
    kind: 'file',
    file: { uri, mimeType: 'image/*' },
    ...(options?.detail && { metadata: { detail: options.detail } }),
  };
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

  for (const item of content) {
    if (isTextContentItem(item)) {
      textChunks.push(item.text);
    } else if (isImageContentItem(item)) {
      imageParts.push(buildFilePart(item.image_url.url, { detail: item.image_url.detail }));
    }
  }

  return [...(textChunks.length > 0 ? [buildTextPart(textChunks.join(' '))] : []), ...imageParts];
};

export const getMessagePartsFromVercelContent = (content?: unknown, parts?: unknown[]): Part[] => {
  // Backwards compatibility: if content is a string, return single text part
  if (typeof content === 'string') {
    return [buildTextPart(content)];
  }

  // Parse parts array
  const parsedParts = (parts ?? [])
    .map((part) => vercelMessageContentPartSchema.safeParse(part))
    .filter((result) => result.success)
    .map((result) => result.data);

  return parsedParts.map((part) => {
    if (part.type === 'text') {
      return buildTextPart(part.text);
    }

    if (part.type === 'image') {
      return buildFilePart(part.text);
    }

    throw new Error(
      `Invalid part type. Expected 'text' or 'image', got ${(part as any).type as string}`
    );
  });
};
