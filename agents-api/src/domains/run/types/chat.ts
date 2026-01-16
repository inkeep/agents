export type ContentItem = {
  type: string;
  text?: string;
};

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
