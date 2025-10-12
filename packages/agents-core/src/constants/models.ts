/**
 * Model name constants used throughout the Inkeep Agents SDK
 */

export const ANTHROPIC_MODELS = {
  CLAUDE_OPUS_4_1: 'anthropic/claude-opus-4-1-20250805',
  CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5-20250531',
  CLAUDE_SONNET_4: 'anthropic/claude-sonnet-4-20250514',
  CLAUDE_3_5_SONNET: 'anthropic/claude-3-5-sonnet-20241022',
  CLAUDE_3_5_HAIKU: 'anthropic/claude-3-5-haiku-20241022',
} as const;

export const OPENAI_MODELS = {
  GPT_5: 'openai/gpt-5-2025-08-07',
  GPT_5_MINI: 'openai/gpt-5-mini-2025-08-07',
  GPT_5_NANO: 'openai/gpt-5-nano-2025-08-07',
  GPT_4_1: 'openai/gpt-4.1-2025-04-14',
  GPT_4_1_MINI: 'openai/gpt-4.1-mini-2025-04-14',
  GPT_4_1_NANO: 'openai/gpt-4.1-nano-2025-04-14',
  GPT_4O: 'gpt-4o',
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4_TURBO: 'gpt-4-turbo',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
} as const;

export const GOOGLE_MODELS = {
  GEMINI_2_5_PRO: 'google/gemini-2.5-pro',
  GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE: 'google/gemini-2.5-flash-lite',
} as const;

export type AnthropicModel = typeof ANTHROPIC_MODELS[keyof typeof ANTHROPIC_MODELS];
export type OpenAIModel = typeof OPENAI_MODELS[keyof typeof OPENAI_MODELS];
export type GoogleModel = typeof GOOGLE_MODELS[keyof typeof GOOGLE_MODELS];
export type ModelName = AnthropicModel | OpenAIModel | GoogleModel;