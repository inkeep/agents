import inquirer from 'inquirer';

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
    pull: {
      model: string;
    };
  };
}

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
    { name: 'Claude Opus 4.1', value: 'anthropic/claude-opus-4-1-20250805' },
    { name: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4-20250514' },
  ];

  const openaiModels = [
    { name: 'GPT-5', value: 'openai/gpt-5-2025-08-07' },
    { name: 'GPT-5 Mini', value: 'openai/gpt-5-mini-2025-08-07' },
    { name: 'GPT-5 Nano', value: 'openai/gpt-5-nano-2025-08-07' },
    { name: 'GPT-4.1', value: 'openai/gpt-4.1-2025-04-14' },
    { name: 'GPT-4.1 Mini', value: 'openai/gpt-4.1-mini-2025-04-14' },
    { name: 'GPT-4.1 Nano', value: 'openai/gpt-4.1-nano-2025-04-14' },
  ];

  // Collect all available models based on selected providers
  const availableModels = [];
  if (providers.includes('anthropic')) {
    availableModels.push(...anthropicModels);
  }
  if (providers.includes('openai')) {
    availableModels.push(...openaiModels);
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
      type: 'list',
      name: 'pullModel',
      message: 'Select your model for TypeScript code generation (inkeep pull command, required):',
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
    pull: {
      model: modelAnswers.pullModel,
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