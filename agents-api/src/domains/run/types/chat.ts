export type TextContentItem = {
  type: 'text';
  text: string;
};

export type ImageContentItem = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
};

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
