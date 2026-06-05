import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  OPENAI_MODELS,
} from '@inkeep/agents-core/constants/models';

export const DEFAULT_BASE_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;
export const DEFAULT_STRUCTURED_OUTPUT_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;
export const DEFAULT_SUMMARIZER_MODEL = GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE;

export const modelOptions = {
  anthropic: [
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
      label: 'Claude Opus 4.8',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
      label: 'Claude Opus 4.7',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
      label: 'Claude Opus 4.6',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_5,
      label: 'Claude Opus 4.5',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
      label: 'Claude Sonnet 4.6',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
      label: 'Claude Sonnet 4.5',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5,
      label: 'Claude Haiku 4.5',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_1,
      label: 'Claude Opus 4.1',
    },
  ],
  openai: [
    {
      value: OPENAI_MODELS.GPT_5_5_PRO,
      label: 'GPT-5.5 Pro',
    },
    {
      value: OPENAI_MODELS.GPT_5_4_PRO,
      label: 'GPT-5.4 Pro',
    },
    {
      value: OPENAI_MODELS.GPT_5_2_PRO,
      label: 'GPT-5.2 Pro',
    },
    {
      value: OPENAI_MODELS.GPT_5_5,
      label: 'GPT-5.5',
    },
    {
      value: OPENAI_MODELS.GPT_5_4,
      label: 'GPT-5.4',
    },
    {
      value: OPENAI_MODELS.GPT_5_2,
      label: 'GPT-5.2',
    },
    {
      value: OPENAI_MODELS.GPT_5_1,
      label: 'GPT-5.1',
    },
    {
      value: OPENAI_MODELS.GPT_5,
      label: 'GPT-5',
    },
    {
      value: OPENAI_MODELS.GPT_5_3_CODEX,
      label: 'GPT-5.3 Codex',
    },
    {
      value: OPENAI_MODELS.GPT_5_4_MINI,
      label: 'GPT-5.4 Mini',
    },
    {
      value: OPENAI_MODELS.GPT_5_MINI,
      label: 'GPT-5 Mini',
    },
    {
      value: OPENAI_MODELS.GPT_5_4_NANO,
      label: 'GPT-5.4 Nano',
    },
    {
      value: OPENAI_MODELS.GPT_5_NANO,
      label: 'GPT-5 Nano',
    },
    {
      value: OPENAI_MODELS.O3_PRO,
      label: 'o3 Pro',
    },
    {
      value: OPENAI_MODELS.O3,
      label: 'o3',
    },
    {
      value: OPENAI_MODELS.GPT_4_1,
      label: 'GPT-4.1',
    },
    {
      value: OPENAI_MODELS.GPT_4_1_MINI,
      label: 'GPT-4.1 Mini',
    },
  ],
  google: [
    {
      value: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      label: 'Gemini 3.1 Pro Preview',
    },
    {
      value: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      label: 'Gemini 3.5 Flash',
    },
    {
      value: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
      label: 'Gemini 3.1 Flash Lite',
    },
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
