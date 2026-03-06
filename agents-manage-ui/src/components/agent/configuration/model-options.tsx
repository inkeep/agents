import {
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  OPENAI_MODELS,
} from '@inkeep/agents-core/constants/models';

export const DEFAULT_ANTHROPIC_BASE_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;
export const DEFAULT_ANTHROPIC_STRUCTURED_OUTPUT_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;
export const DEFAULT_ANTHROPIC_SUMMARIZER_MODEL = ANTHROPIC_MODELS.CLAUDE_SONNET_4_5;

export const DEFAULT_OPENAI_BASE_MODEL = OPENAI_MODELS.GPT_5_2;
export const DEFAULT_OPENAI_STRUCTURED_OUTPUT_MODEL = OPENAI_MODELS.GPT_5_2;
export const DEFAULT_OPENAI_SUMMARIZER_MODEL = OPENAI_MODELS.GPT_4_1_NANO;

export const DEFAULT_GOOGLE_BASE_MODEL = GOOGLE_MODELS.GEMINI_2_5_FLASH;
export const DEFAULT_GOOGLE_STRUCTURED_OUTPUT_MODEL = GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE;
export const DEFAULT_GOOGLE_SUMMARIZER_MODEL = GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE;

export const modelOptions = {
  anthropic: [
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
      label: 'Claude Opus 4.6',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_5,
      label: 'Claude Opus 4.5',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_1,
      label: 'Claude Opus 4.1',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_OPUS_4,
      label: 'Claude Opus 4',
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
      value: ANTHROPIC_MODELS.CLAUDE_SONNET_4,
      label: 'Claude Sonnet 4',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_3_7_SONNET,
      label: 'Claude 3.7 Sonnet',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_3_5_SONNET,
      label: 'Claude 3.5 Sonnet',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5,
      label: 'Claude Haiku 4.5',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU,
      label: 'Claude Haiku 3.5',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_3_OPUS,
      label: 'Claude 3 Opus',
    },
    {
      value: ANTHROPIC_MODELS.CLAUDE_3_HAIKU,
      label: 'Claude 3 Haiku',
    },
  ],
  openai: [
    {
      value: OPENAI_MODELS.GPT_5_4_PRO,
      label: 'GPT-5.4 Pro',
    },
    {
      value: OPENAI_MODELS.GPT_5_4,
      label: 'GPT-5.4',
    },
    {
      value: OPENAI_MODELS.GPT_5_3_CODEX,
      label: 'GPT-5.3 Codex',
    },
    {
      value: OPENAI_MODELS.GPT_5_2_PRO,
      label: 'GPT-5.2 Pro',
    },
    {
      value: OPENAI_MODELS.GPT_5_2_CODEX,
      label: 'GPT-5.2 Codex',
    },
    {
      value: OPENAI_MODELS.GPT_5_2,
      label: 'GPT-5.2',
    },
    {
      value: OPENAI_MODELS.GPT_5_1_CODEX_MAX,
      label: 'GPT-5.1 Codex Max',
    },
    {
      value: OPENAI_MODELS.GPT_5_1_CODEX,
      label: 'GPT-5.1 Codex',
    },
    {
      value: OPENAI_MODELS.GPT_5_1_CODEX_MINI,
      label: 'GPT-5.1 Codex Mini',
    },
    {
      value: OPENAI_MODELS.GPT_5_1_THINKING,
      label: 'GPT-5.1 Thinking',
    },
    {
      value: OPENAI_MODELS.GPT_5_1,
      label: 'GPT-5.1',
    },
    {
      value: OPENAI_MODELS.GPT_5_PRO,
      label: 'GPT-5 Pro',
    },
    {
      value: OPENAI_MODELS.GPT_5_CODEX,
      label: 'GPT-5 Codex',
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
    {
      value: OPENAI_MODELS.O4_MINI,
      label: 'o4-mini',
    },
    {
      value: OPENAI_MODELS.O3_PRO,
      label: 'o3-pro',
    },
    {
      value: OPENAI_MODELS.O3,
      label: 'o3',
    },
    {
      value: OPENAI_MODELS.O3_MINI,
      label: 'o3-mini',
    },
    {
      value: OPENAI_MODELS.O1,
      label: 'o1',
    },
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
      value: OPENAI_MODELS.GPT_4O,
      label: 'GPT-4o',
    },
    {
      value: OPENAI_MODELS.GPT_4O_MINI,
      label: 'GPT-4o Mini',
    },
    {
      value: OPENAI_MODELS.GPT_4_TURBO,
      label: 'GPT-4 Turbo',
    },
    {
      value: OPENAI_MODELS.GPT_3_5_TURBO,
      label: 'GPT-3.5 Turbo',
    },
    {
      value: OPENAI_MODELS.CODEX_MINI,
      label: 'Codex Mini',
    },
  ],
  google: [
    {
      value: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      label: 'Gemini 3.1 Pro Preview',
    },
    {
      value: GOOGLE_MODELS.GEMINI_3_PRO_PREVIEW,
      label: 'Gemini 3 Pro Preview',
    },
    {
      value: GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW,
      label: 'Gemini 3 Flash Preview',
    },
    {
      value: GOOGLE_MODELS.GEMINI_3_FLASH,
      label: 'Gemini 3 Flash',
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
    {
      value: GOOGLE_MODELS.GEMINI_2_0_FLASH,
      label: 'Gemini 2.0 Flash',
    },
    {
      value: GOOGLE_MODELS.GEMINI_2_0_FLASH_LITE,
      label: 'Gemini 2.0 Flash Lite',
    },
  ],
};
