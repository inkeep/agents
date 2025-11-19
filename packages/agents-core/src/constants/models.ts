/**
 * Model name constants used throughout the Inkeep Agents SDK
 */

export const ANTHROPIC_MODELS = {
  CLAUDE_OPUS_4_1: 'anthropic/claude-opus-4-1',
  CLAUDE_OPUS_4_1_20250805: 'anthropic/claude-opus-4-1-20250805',
  CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4-5',
  CLAUDE_SONNET_4_5_20250929: 'anthropic/claude-sonnet-4-5-20250929',
  CLAUDE_SONNET_4: 'anthropic/claude-sonnet-4-0',
  CLAUDE_SONNET_4_20250514: 'anthropic/claude-sonnet-4-20250514',
  CLAUDE_HAIKU_4_5: 'anthropic/claude-haiku-4-5',
  CLAUDE_HAIKU_4_5_20251001: 'anthropic/claude-haiku-4-5-20251001',
  CLAUDE_3_5_HAIKU: 'anthropic/claude-3-5-haiku-latest',
  CLAUDE_3_5_HAIKU_20241022: 'anthropic/claude-3-5-haiku-20241022',
} as const;

export const OPENAI_MODELS = {
  GPT_5_1: 'openai/gpt-5.1',
  GPT_5: 'openai/gpt-5',
  GPT_5_20250807: 'openai/gpt-5-2025-08-07',
  GPT_5_MINI: 'openai/gpt-5-mini',
  GPT_5_MINI_20250807: 'openai/gpt-5-mini-2025-08-07',
  GPT_5_NANO: 'openai/gpt-5-nano',
  GPT_5_NANO_20250807: 'openai/gpt-5-nano-2025-08-07',
  GPT_4_1: 'openai/gpt-4.1',
  GPT_4_1_20250414: 'openai/gpt-4.1-2025-04-14',
  GPT_4_1_MINI: 'openai/gpt-4.1-mini',
  GPT_4_1_MINI_20250414: 'openai/gpt-4.1-mini-2025-04-14',
  GPT_4_1_NANO: 'openai/gpt-4.1-nano',
  GPT_4_1_NANO_20250414: 'openai/gpt-4.1-nano-2025-04-14',
} as const;

export const GOOGLE_MODELS = {
  GEMINI_3_PRO_PREVIEW: 'google/gemini-3-pro-preview',
  GEMINI_2_5_PRO: 'google/gemini-2.5-pro',
  GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE: 'google/gemini-2.5-flash-lite',
} as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS];
export type OpenAIModel = (typeof OPENAI_MODELS)[keyof typeof OPENAI_MODELS];
export type GoogleModel = (typeof GOOGLE_MODELS)[keyof typeof GOOGLE_MODELS];
export type ModelName = AnthropicModel | OpenAIModel | GoogleModel;
