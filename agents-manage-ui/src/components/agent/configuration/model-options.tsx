import { ANTHROPIC_MODELS, OPENAI_MODELS, GOOGLE_MODELS } from '@inkeep/agents-core/constants/models';

export const DEFAULT_ANTHROPIC_BASE_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;
export const DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;
export const DEFAULT_ANTHROPIC_SUMMARIZER_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;

export const DEFAULT_OPENAI_BASE_MODEL = OPENAI_MODELS.GPT_4_1;
export const DEFAULT_OPENAI_STRUCTURED_OUTPUT_MODEL = OPENAI_MODELS.GPT_4_1_MINI;
export const DEFAULT_OPENAI_SUMMARIZER_MODEL = OPENAI_MODELS.GPT_4_1_NANO;

export const DEFAULT_GOOGLE_BASE_MODEL = GOOGLE_MODELS.GEMINI_2_5_FLASH;
export const DEFAULT_GOOGLE_STRUCTURED_OUTPUT_MODEL = GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE;
export const DEFAULT_GOOGLE_SUMMARIZER_MODEL = GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE;

export const modelOptions = {
  anthropic: [
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_1,
      label: 'Claude Opus 4.1',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
      label: 'Claude Sonnet 4.5',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_SONNET_4,
      label: 'Claude Sonnet 4',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU,
      label: 'Claude 3.5 Haiku',
    },
  ],
  openai: [
    {
      value: OPENAI_MODELS.GPT_4_1,
      label: 'GPT-4.1',
    },
    {
      value: OPENAI_MODELS.GPT_4_1_MINI,
      label: 'GPT-4.1 Mini',
    },
    {
      value: OPENAI_MODELS.GPT_4_1_NANO,
      label: 'GPT-4.1 Nano',
    },
    {
      value: OPENAI_MODELS.GPT_5,
      label: 'GPT-5',
    },
    {
      value: OPENAI_MODELS.GPT_5_MINI,
      label: 'GPT-5 Mini',
    },
    {
      value: OPENAI_MODELS.GPT_5_NANO,
      label: 'GPT-5 Nano',
    },
  ],
  google: [
    {
      value: GOOGLE_MODELS.GEMINI_2_5_PRO,
      label: 'Gemini 2.5 Pro',
    },
    {
      value: GOOGLE_MODELS.GEMINI_2_5_FLASH,
      label: 'Gemini 2.5 Flash',
    },
    {
      value: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
      label: 'Gemini 2.5 Flash Lite',
    },
  ],
};
