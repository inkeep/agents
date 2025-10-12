import inquirer from 'inquirer';
import { ANTHROPIC_MODELS, OPENAI_MODELS, GOOGLE_MODELS } from '@inkeep/agents-core';

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
  const { providers } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'providers',
      message: 'Which AI providers would you like to configure?',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT)', value: 'openai' },
        { name: 'Google (Gemini)', value: 'google' },
      ],
      validate: (input: string[]) => {
        if (input.length === 0) {
          return 'Please select at least one provider';
        }
        return true;
      },
    },
  ]);

  // Available models for each provider (matching frontend options)
  const anthropicModels = [
    { name: 'Claude Opus 4.1', value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_1 },
    { name: 'Claude Sonnet 4.5', value: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5 },
    { name: 'Claude Sonnet 4', value: ANTHROPIC_MODELS.CLAUDE_SONNET_4 },
    { name: 'Claude Haiku 3.5', value: ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU },
  ];

  const openaiModels = [
    { name: 'GPT-4.1', value: OPENAI_MODELS.GPT_4_1 },
    { name: 'GPT-4.1 Mini', value: OPENAI_MODELS.GPT_4_1_MINI },
    { name: 'GPT-4.1 Nano', value: OPENAI_MODELS.GPT_4_1_NANO },
    { name: 'GPT-5', value: OPENAI_MODELS.GPT_5 },
    { name: 'GPT-5 Mini', value: OPENAI_MODELS.GPT_5_MINI },
    { name: 'GPT-5 Nano', value: OPENAI_MODELS.GPT_5_NANO },
  ];

  const googleModels = [
    { name: 'Gemini 2.5 Pro', value: GOOGLE_MODELS.GEMINI_2_5_PRO },
    { name: 'Gemini 2.5 Flash', value: GOOGLE_MODELS.GEMINI_2_5_FLASH },
    { name: 'Gemini 2.5 Flash Lite', value: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE },
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
  const modelAnswers = await inquirer.prompt([
    {
      type: 'list',
      name: 'baseModel',
      message: 'Select your default model for general tasks (required):',
      choices: availableModels,
    },
    {
      type: 'confirm',
      name: 'configureOptionalModels',
      message: 'Would you like to configure optional models for structured output and summaries?',
      default: false,
    },
  ]);

  let optionalModels: any = {};
  if (modelAnswers.configureOptionalModels) {
    const optionalChoices = [...availableModels, { name: 'Use base model', value: null }];

    optionalModels = await inquirer.prompt([
      {
        type: 'list',
        name: 'structuredOutputModel',
        message: 'Select your model for structured output tasks (or use base model):',
        choices: optionalChoices,
      },
      {
        type: 'list',
        name: 'summarizerModel',
        message: 'Select your model for summaries and quick tasks (or use base model):',
        choices: optionalChoices,
      },
    ]);
  }

  // Build model settings object
  const modelSettings: any = {
    base: {
      model: modelAnswers.baseModel,
    },
  };

  // Add optional models only if they were configured
  if (optionalModels.structuredOutputModel) {
    modelSettings.structuredOutput = {
      model: optionalModels.structuredOutputModel,
    };
  }

  if (optionalModels.summarizerModel) {
    modelSettings.summarizer = {
      model: optionalModels.summarizerModel,
    };
  }

  return { modelSettings };
}
