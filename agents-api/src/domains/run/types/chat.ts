import { z } from '@hono/zod-openapi';
import { DATA_URI_IMAGE_BASE64_REGEX } from '@inkeep/agents-core/constants/allowed-image-formats';

export type TextContentItem = {
  type: 'text';
  text: string;
};

export const ImageUrlSchema = z.union([
  z.httpUrl(),
  z
    .string()
    .regex(
      DATA_URI_IMAGE_BASE64_REGEX,
      'Image must be PNG, JPEG, or WebP format (GIF not supported by all providers)'
    )
    .refine((val) => {
      const base64Part = val.split(',')[1];
      return /^[A-Za-z0-9+/]+={0,2}$/.test(base64Part ?? '');
    }, 'Invalid base64 data in image data URI'),
]);

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

export type ContentItem = TextContentItem | ImageContentItem;

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
