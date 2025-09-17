export const DEFAULT_ANTHROPIC_BASE_MODEL = 'anthropic/claude-sonnet-4-20250514';
export const DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL = 'anthropic/claude-haiku-3-5-20241022';
export const DEFAULT_ANTHROPIC_SUMMARIZER_MODEL = 'anthropic/claude-haiku-3-5-20241022';

export const DEFAULT_OPENAI_BASE_MODEL = 'openai/gpt-5-2025-08-07';
export const DEFAULT_OPENAI_STRUCTURED_OUTPUT_MODEL = 'openai/gpt-4.1-mini-2025-04-14';
export const DEFAULT_OPENAI_SUMMARIZER_MODEL = 'openai/gpt-4.1-nano-2025-04-14';

export const DEFAULT_GOOGLE_BASE_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_GOOGLE_STRUCTURED_OUTPUT_MODEL = 'google/gemini-2.5-flash-lite';
export const DEFAULT_GOOGLE_SUMMARIZER_MODEL = 'google/gemini-2.5-flash-lite';

export const DEFAULT_OPENROUTER_BASE_MODEL = 'openrouter/anthropic/claude-sonnet-4';
export const DEFAULT_OPENROUTER_STRUCTURED_OUTPUT_MODEL = 'openrouter/openai/gpt-4.1-mini';
export const DEFAULT_OPENROUTER_SUMMARIZER_MODEL = 'openrouter/openai/gpt-4.1-nano';

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
      value: 'anthropic/claude-haiku-3-5-20241022',
      label: 'anthropic/claude-haiku-3-5-20241022',
    },
  ],
  openai: [
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
  openrouter: [
    {
      value: 'openrouter/anthropic/claude-sonnet-4',
      label: 'openrouter/anthropic/claude-sonnet-4',
    },
    {
      value: 'openrouter/openai/gpt-4.1-mini',
      label: 'openrouter/openai/gpt-4.1-mini',
    },
    {
      value: 'openrouter/openai/gpt-4.1-nano',
      label: 'openrouter/openai/gpt-4.1-nano',
    },
  ],
};

// Helper function to check if a model value is custom (not in predefined options)
export const isCustomModelValue = (value: string): boolean => {
  for (const [_provider, models] of Object.entries(modelOptions)) {
    if (models.some(m => m.value === value)) {
      return false;
    }
  }
  return Boolean(value) && value.includes('/');
};
