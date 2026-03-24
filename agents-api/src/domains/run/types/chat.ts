import { z } from '@hono/zod-openapi';
import {
  DATA_URI_IMAGE_BASE64_REGEX,
  DATA_URI_PDF_BASE64_REGEX,
  DATA_URI_TEXT_BASE64_REGEX,
  normalizeMimeType,
} from '@inkeep/agents-core/constants/allowed-file-formats';
import { isTextDocumentMimeType } from '../utils/text-document-attachments';

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

const TextDocumentDataUriSchema = z
  .string()
  .regex(
    DATA_URI_TEXT_BASE64_REGEX,
    'File must be a text/plain, text/markdown, text/html, text/csv, or text/x-log data URI'
  )
  .refine(hasValidBase64Payload, 'Invalid base64 data in text document data URI');

export const ImageUrlSchema = z.union([z.httpUrl(), ImageDataUriSchema]);
export const PdfDataOrUrlSchema = z.union([PdfDataUriSchema, z.httpUrl()]);
export const InlineDocumentDataSchema = z.union([PdfDataOrUrlSchema, TextDocumentDataUriSchema]);

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
    file_data: InlineDocumentDataSchema,
    filename: z.string().optional(),
  }),
});

export type FileContentItem = z.infer<typeof FileContentItemSchema>;

// --- Vercel data-stream content part schemas ---

export const VercelTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const VercelImagePartSchema = z.object({
  type: z.literal('image'),
  text: ImageUrlSchema,
});

export const VercelFilePartSchema = z
  .object({
    type: z.literal('file'),
    url: z.string(),
    mediaType: z.string(),
    filename: z.string().optional(),
  })
  .superRefine((part, ctx) => {
    const mimeType = normalizeMimeType(part.mediaType);

    if (isTextDocumentMimeType(mimeType) && !DATA_URI_TEXT_BASE64_REGEX.test(part.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Text document file parts must use inline base64 data URIs',
        path: ['url'],
      });
    }
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

export const ContentItemSchema = z.union([
  VercelTextPartSchema,
  ImageContentItemSchema,
  FileContentItemSchema,
]);

export type TextContentItem = z.infer<typeof VercelTextPartSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;

export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
  content: z.union([z.string(), z.array(ContentItemSchema)]),
  name: z.string().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(MessageSchema),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  n: z.number().optional(),
  stream: z.boolean().optional(),
  max_tokens: z.number().optional(),
  presence_penalty: z.number().optional(),
  frequency_penalty: z.number().optional(),
  logit_bias: z.record(z.string(), z.number()).optional(),
  user: z.string().optional(),
  tools: z.record(z.string(), z.unknown()).optional(),
  runConfig: z.record(z.string(), z.unknown()).optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
