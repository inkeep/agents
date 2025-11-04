import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';
import * as p from '@clack/prompts';

export interface ModelConfigurationResult {
  modelSettings: {
    base: {
      model: string;
    };
    structuredOutput?: {
      model: string;
    };
    summarizer?: {
      model: string;
    };
  };
}

export const defaultGeminiModelConfigurations = {
  base: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH,
  },
  structuredOutput: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
  summarizer: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
};

export const defaultOpenaiModelConfigurations = {
  base: {
    model: OPENAI_MODELS.GPT_4_1,
  },
  structuredOutput: {
    model: OPENAI_MODELS.GPT_4_1_MINI,
  },
  summarizer: {
    model: OPENAI_MODELS.GPT_4_1_NANO,
  },
};

export const defaultAnthropicModelConfigurations = {
  base: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  structuredOutput: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  summarizer: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
};

/**
 * Prompt user for model configuration (providers and model selection)
 * This is shared between init and push commands
 */
export async function promptForModelConfiguration(): Promise<ModelConfigurationResult> {
  // Provider selection
  const providers = (await p.multiselect({
    message: 'Which AI providers would you like to configure?',
    options: [
      { value: 'anthropic', label: 'Anthropic (Claude)' },
      { value: 'openai', label: 'OpenAI (GPT)' },
      { value: 'google', label: 'Google (Gemini)' },
    ],
    required: true,
  })) as string[];

  if (p.isCancel(providers)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  // Available models for each provider (matching frontend options)
  const anthropicModels = [
    { label: 'Claude Opus 4.1', value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_1 },
    { label: 'Claude Sonnet 4.5', value: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5 },
    { label: 'Claude Sonnet 4', value: ANTHROPIC_MODELS.CLAUDE_SONNET_4 },
    { label: 'Claude Haiku 4.5', value: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5 },
    { label: 'Claude Haiku 3.5', value: ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU },
  ];

  const openaiModels = [
    { label: 'GPT-4.1', value: OPENAI_MODELS.GPT_4_1 },
    { label: 'GPT-4.1 Mini', value: OPENAI_MODELS.GPT_4_1_MINI },
    { label: 'GPT-4.1 Nano', value: OPENAI_MODELS.GPT_4_1_NANO },
    { label: 'GPT-5', value: OPENAI_MODELS.GPT_5 },
    { label: 'GPT-5 Mini', value: OPENAI_MODELS.GPT_5_MINI },
    { label: 'GPT-5 Nano', value: OPENAI_MODELS.GPT_5_NANO },
  ];

  const googleModels = [
    { label: 'Gemini 2.5 Pro', value: GOOGLE_MODELS.GEMINI_2_5_PRO },
    { label: 'Gemini 2.5 Flash', value: GOOGLE_MODELS.GEMINI_2_5_FLASH },
    { label: 'Gemini 2.5 Flash Lite', value: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE },
  ];

  // Collect all available models based on selected providers
  const availableModels = [];
  if (providers.includes('anthropic')) {
    availableModels.push(...anthropicModels);
  }
  if (providers.includes('openai')) {
    availableModels.push(...openaiModels);
  }
  if (providers.includes('google')) {
    availableModels.push(...googleModels);
  }

  // Model selection for different use cases
  const baseModel = (await p.select({
    message: 'Select your default model for general tasks (required):',
    options: availableModels,
  })) as string;

  if (p.isCancel(baseModel)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const configureOptionalModels = await p.confirm({
    message: 'Would you like to configure optional models for structured output and summaries?',
    initialValue: false,
  });

  if (p.isCancel(configureOptionalModels)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  let structuredOutputModel: string | null = null;
  let summarizerModel: string | null = null;

  if (configureOptionalModels) {
    const optionalChoices = [...availableModels, { label: 'Use base model', value: null }];

    const structuredOutputResponse = await p.select({
      message: 'Select your model for structured output tasks (or use base model):',
      options: optionalChoices,
    });

    if (p.isCancel(structuredOutputResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    structuredOutputModel = structuredOutputResponse as string | null;

    const summarizerResponse = await p.select({
      message: 'Select your model for summaries and quick tasks (or use base model):',
      options: optionalChoices,
    });

    if (p.isCancel(summarizerResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    summarizerModel = summarizerResponse as string | null;
  }

  // Build model settings object
  const modelSettings: any = {
    base: {
      model: baseModel,
    },
  };

  // Add optional models only if they were configured
  if (structuredOutputModel) {
    modelSettings.structuredOutput = {
      model: structuredOutputModel,
    };
  }

  if (summarizerModel) {
    modelSettings.summarizer = {
      model: summarizerModel,
    };
  }

  return { modelSettings };
}
