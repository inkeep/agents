export const DEFAULT_ANTHOPIC_BASE_MODEL = 'anthropic/claude-sonnet-4-20250514';
export const DEFAULT_ANTHOPIC_STRUCTURED_OUTPUT_MODEL = 'anthropic/claude-sonnet-4-20250514';
export const DEFAULT_ANTHOPIC_SUMMARIZER_MODEL = 'anthropic/claude-sonnet-4-20250514';

export const DEFAULT_OPENAI_BASE_MODEL = 'openai/gpt-5-2025-08-07';
export const DEFAULT_OPENAI_STRUCTURED_OUTPUT_MODEL = 'openai/gpt-4.1-mini-2025-04-14';
export const DEFAULT_OPENAI_SUMMARIZER_MODEL = 'openai/gpt-4.1-nano-2025-04-14';

export const DEFAULT_BASE_MODEL = DEFAULT_ANTHOPIC_BASE_MODEL;
export const DEFAULT_STRUCTURED_OUTPUT_MODEL = DEFAULT_OPENAI_STRUCTURED_OUTPUT_MODEL;
export const DEFAULT_SUMMARIZER_MODEL = DEFAULT_OPENAI_SUMMARIZER_MODEL;

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
};
