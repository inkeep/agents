import { z } from '@hono/zod-openapi';
import {
  DATA_URI_IMAGE_BASE64_REGEX,
  DATA_URI_PDF_BASE64_REGEX,
} from '@inkeep/agents-core/constants/allowed-file-formats';

export type TextContentItem = {
  type: 'text';
  text: string;
};

const hasValidBase64Payload = (val: string): boolean => {
  const base64Part = val.split(',')[1];
  return /^[A-Za-z0-9+/]+={0,2}$/.test(base64Part ?? '');
};

const ImageDataUriSchema = z
  .string()
  .regex(
    DATA_URI_IMAGE_BASE64_REGEX,
    'Image must be PNG, JPEG, or WebP format (GIF not supported by all providers)'
  )
  .refine(hasValidBase64Payload, 'Invalid base64 data in image data URI');

const PdfDataUriSchema = z
  .string()
  .regex(DATA_URI_PDF_BASE64_REGEX, 'File must be a PDF data URI')
  .refine(hasValidBase64Payload, 'Invalid base64 data in PDF data URI');

export const ImageUrlSchema = z.union([z.httpUrl(), ImageDataUriSchema]);

/** OpenAI-specific image detail level. Has no effect on other providers. */
export const ImageDetailEnum = ['auto', 'low', 'high'] as const;
export const ImageDetailSchema = z.enum(ImageDetailEnum);
export type ImageDetail = z.infer<typeof ImageDetailSchema>;

export const ImageContentItemSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: ImageUrlSchema,
    detail: ImageDetailSchema.optional(),
  }),
});

export type ImageContentItem = z.infer<typeof ImageContentItemSchema>;

export const FileContentItemSchema = z.object({
  type: z.literal('file'),
  file: z.object({
    file_data: PdfDataUriSchema,
    filename: z.string().optional(),
  }),
});

export type FileContentItem = z.infer<typeof FileContentItemSchema>;

export type ContentItem = TextContentItem | ImageContentItem | FileContentItem;

export type Message = {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | ContentItem[];
  name?: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: Message[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: Record<string, unknown>; // Could be properly typed if needed
  runConfig?: Record<string, unknown>; // For assistant API requests
};
