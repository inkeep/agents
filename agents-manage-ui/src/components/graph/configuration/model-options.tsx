export const DEFAULT_ANTHROPIC_BASE_MODEL = 'anthropic/claude-sonnet-4-20250514';
export const DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL = 'anthropic/claude-sonnet-4-2025051';
export const DEFAULT_ANTHROPIC_SUMMARIZER_MODEL = 'anthropic/claude-sonnet-4-20250514';

export const DEFAULT_OPENAI_BASE_MODEL = 'openai/gpt-4.1-2025-04-14';
export const DEFAULT_OPENAI_STRUCTURED_OUTPUT_MODEL = 'openai/gpt-4.1-mini-2025-04-14';
export const DEFAULT_OPENAI_SUMMARIZER_MODEL = 'openai/gpt-4.1-nano-2025-04-14';

export const DEFAULT_GOOGLE_BASE_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_GOOGLE_STRUCTURED_OUTPUT_MODEL = 'google/gemini-2.5-flash-lite';
export const DEFAULT_GOOGLE_SUMMARIZER_MODEL = 'google/gemini-2.5-flash-lite';

export const modelOptions = {
  anthropic: [
    {
      value: 'anthropic/claude-opus-4-1-20250805',
      label: 'anthropic/claude-opus-4-1-20250805',
    },
    {
      value: 'anthropic/claude-sonnet-4-20250514',
      label: 'anthropic/claude-sonnet-4-20250514',
    },
    {
      value: 'anthropic/claude-3-5-haiku-20241022',
      label: 'anthropic/claude-3-5-haiku-20241022',
    },
  ],
  openai: [
    {
      value: 'openai/gpt-4.1-2025-04-14',
      label: 'openai/gpt-4.1-2025-04-14',
    },
    {
      value: 'openai/gpt-4.1-mini-2025-04-14',
      label: 'openai/gpt-4.1-mini-2025-04-14',
    },
    {
      value: 'openai/gpt-4.1-nano-2025-04-14',
      label: 'openai/gpt-4.1-nano-2025-04-14',
    },
    {
      value: 'openai/gpt-5-2025-08-07',
      label: 'openai/gpt-5-2025-08-07',
    },
    {
      value: 'openai/gpt-5-mini-2025-08-07',
      label: 'openai/gpt-5-mini-2025-08-07',
    },
    {
      value: 'openai/gpt-5-nano-2025-08-07',
      label: 'openai/gpt-5-nano-2025-08-07',
    },
  ],
  google: [
    {
      value: 'google/gemini-2.5-pro',
      label: 'google/gemini-2.5-pro',
    },
    {
      value: 'google/gemini-2.5-flash',
      label: 'google/gemini-2.5-flash',
    },
    {
      value: 'google/gemini-2.5-flash-lite',
      label: 'google/gemini-2.5-flash-lite',
    },
  ],
};
