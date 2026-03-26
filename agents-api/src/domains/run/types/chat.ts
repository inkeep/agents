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
export const PdfDataOrUrlSchema = z.union([PdfDataUriSchema, z.httpUrl()]);

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
    file_data: PdfDataOrUrlSchema,
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

// --- Vercel data-stream content part schemas ---

export const VercelTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const VercelImagePartSchema = z.object({
  type: z.literal('image'),
  text: ImageUrlSchema,
});

export const VercelFilePartSchema = z.object({
  type: z.literal('file'),
  url: z.string(),
  mediaType: z.string(),
  filename: z.string().optional(),
});

export const VercelAudioVideoPartSchema = z.object({
  type: z.union([
    z.enum(['audio', 'video']),
    z.string().regex(/^data-/, 'Type must start with "data-"'),
  ]),
  text: z.string().optional(),
});

export const VercelToolApprovalPartSchema = z.object({
  type: z.string().regex(/^tool-/, 'Type must start with "tool-"'),
  toolCallId: z.string(),
  state: z.any(),
  approval: z
    .object({
      id: z.string(),
      approved: z.boolean().optional(),
      reason: z.string().optional(),
    })
    .optional(),
  input: z.any().optional(),
  callProviderMetadata: z.any().optional(),
});

export const VercelStepStartPartSchema = z.object({
  type: z.literal('step-start'),
});

export const VercelMessagePartSchema = z.union([
  VercelTextPartSchema,
  VercelImagePartSchema,
  VercelFilePartSchema,
  VercelAudioVideoPartSchema,
  VercelToolApprovalPartSchema,
  VercelStepStartPartSchema,
]);

export const VercelMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
  content: z.any(),
  parts: z.array(VercelMessagePartSchema).optional(),
});

export const VercelContentPartSchema = z.union([
  VercelTextPartSchema,
  VercelImagePartSchema,
  VercelFilePartSchema,
]);

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
