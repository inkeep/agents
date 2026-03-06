/**
 * Model name constants used throughout the Inkeep Agents SDK
 */

export const ANTHROPIC_MODELS = {
  CLAUDE_OPUS_4_6: 'anthropic/claude-opus-4-6',
  CLAUDE_OPUS_4_6_20260205: 'anthropic/claude-opus-4-6-20260205',
  CLAUDE_OPUS_4_5: 'anthropic/claude-opus-4-5',
  CLAUDE_OPUS_4_5_20251101: 'anthropic/claude-opus-4-5-20251101',
  CLAUDE_OPUS_4_1: 'anthropic/claude-opus-4-1',
  CLAUDE_OPUS_4_1_20250805: 'anthropic/claude-opus-4-1-20250805',
  CLAUDE_OPUS_4: 'anthropic/claude-opus-4',
  CLAUDE_SONNET_4_6: 'anthropic/claude-sonnet-4-6',
  CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4-5',
  CLAUDE_SONNET_4_5_20250929: 'anthropic/claude-sonnet-4-5-20250929',
  CLAUDE_SONNET_4_0: 'anthropic/claude-sonnet-4-0',
  CLAUDE_SONNET_4: 'anthropic/claude-sonnet-4',
  CLAUDE_SONNET_4_20250514: 'anthropic/claude-sonnet-4-20250514',
  CLAUDE_HAIKU_4_5: 'anthropic/claude-haiku-4-5',
  CLAUDE_HAIKU_4_5_20251001: 'anthropic/claude-haiku-4-5-20251001',
  CLAUDE_3_7_SONNET: 'anthropic/claude-3-7-sonnet',
  CLAUDE_3_5_SONNET: 'anthropic/claude-3-5-sonnet',
  CLAUDE_3_5_SONNET_20240620: 'anthropic/claude-3-5-sonnet-20240620',
  CLAUDE_3_5_HAIKU: 'anthropic/claude-3-5-haiku',
  CLAUDE_3_5_HAIKU_20241022: 'anthropic/claude-3-5-haiku-20241022',
  CLAUDE_3_OPUS: 'anthropic/claude-3-opus',
  CLAUDE_3_HAIKU: 'anthropic/claude-3-haiku',
} as const;

export const OPENAI_MODELS = {
  GPT_5_4_PRO: 'openai/gpt-5.4-pro',
  GPT_5_4: 'openai/gpt-5.4',
  GPT_5_2_CODEX: 'openai/gpt-5.2-codex',
  GPT_5_2: 'openai/gpt-5.2',
  GPT_5_2_20251211: 'openai/gpt-5.2-2025-12-11',
  GPT_5_1_THINKING: 'openai/gpt-5.1-thinking',
  GPT_5_1_CODEX_MAX: 'openai/gpt-5.1-codex-max',
  GPT_5_1_CODEX_MINI: 'openai/gpt-5.1-codex-mini',
  GPT_5_1_CODEX: 'openai/gpt-5.1-codex',
  GPT_5_1: 'openai/gpt-5.1',
  GPT_5_1_20251113: 'openai/gpt-5.1-2025-11-13',
  GPT_5_PRO: 'openai/gpt-5-pro',
  GPT_5_CODEX: 'openai/gpt-5-codex',
  GPT_5: 'openai/gpt-5',
  GPT_5_20250807: 'openai/gpt-5-2025-08-07',
  GPT_5_MINI: 'openai/gpt-5-mini',
  GPT_5_MINI_20250807: 'openai/gpt-5-mini-2025-08-07',
  GPT_5_NANO: 'openai/gpt-5-nano',
  GPT_5_NANO_20250807: 'openai/gpt-5-nano-2025-08-07',
  O3_PRO: 'openai/o3-pro',
  O3: 'openai/o3',
  O3_MINI: 'openai/o3-mini',
  O4_MINI: 'openai/o4-mini',
  O1: 'openai/o1',
  GPT_4O: 'openai/gpt-4o',
  GPT_4O_MINI: 'openai/gpt-4o-mini',
  GPT_4_TURBO: 'openai/gpt-4-turbo',
  GPT_4_1: 'openai/gpt-4.1',
  GPT_4_1_20250414: 'openai/gpt-4.1-2025-04-14',
  GPT_4_1_MINI: 'openai/gpt-4.1-mini',
  GPT_4_1_MINI_20250414: 'openai/gpt-4.1-mini-2025-04-14',
  GPT_4_1_NANO: 'openai/gpt-4.1-nano',
  GPT_4_1_NANO_20250414: 'openai/gpt-4.1-nano-2025-04-14',
  GPT_3_5_TURBO: 'openai/gpt-3.5-turbo',
  CODEX_MINI: 'openai/codex-mini',
} as const;

export const GOOGLE_MODELS = {
  GEMINI_3_1_FLASH_LITE_PREVIEW: 'google/gemini-3.1-flash-lite-preview',
  GEMINI_3_1_PRO_PREVIEW: 'google/gemini-3.1-pro-preview',
  GEMINI_3_FLASH: 'google/gemini-3-flash',
  GEMINI_3_PRO_PREVIEW: 'google/gemini-3-pro-preview',
  GEMINI_3_FLASH_PREVIEW: 'google/gemini-3-flash-preview',
  GEMINI_2_5_FLASH_PREVIEW_09_2025: 'google/gemini-2.5-flash-preview-09-2025',
  GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025: 'google/gemini-2.5-flash-lite-preview-09-2025',
  GEMINI_2_5_PRO: 'google/gemini-2.5-pro',
  GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',
  GEMINI_2_5_FLASH_LITE: 'google/gemini-2.5-flash-lite',
  GEMINI_2_0_FLASH: 'google/gemini-2.0-flash',
  GEMINI_2_0_FLASH_LITE: 'google/gemini-2.0-flash-lite',
} as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS];
export type OpenAIModel = (typeof OPENAI_MODELS)[keyof typeof OPENAI_MODELS];
export type GoogleModel = (typeof GOOGLE_MODELS)[keyof typeof GOOGLE_MODELS];
export type ModelName = AnthropicModel | OpenAIModel | GoogleModel;
