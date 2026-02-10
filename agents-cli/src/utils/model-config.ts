import * as p from '@clack/prompts';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';

export interface ModelConfigurationResult {
  modelSettings: {
    base: {
      model: string;
      providerOptions?: Record<string, any>;
    };
    summarizer?: {
      model: string;
      providerOptions?: Record<string, any>;
    };
  };
}

export type ModelSettings = ModelConfigurationResult['modelSettings'];

export const defaultGeminiModelConfigurations: ModelSettings = {
  base: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH,
  },
  summarizer: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
};

export const defaultOpenaiModelConfigurations: ModelSettings = {
  base: {
    model: OPENAI_MODELS.GPT_5_2,
  },
  summarizer: {
    model: OPENAI_MODELS.GPT_4_1_NANO,
  },
};

export const defaultAnthropicModelConfigurations: ModelSettings = {
  base: {
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
      { value: 'azure', label: 'Azure OpenAI' },
    ],
    required: true,
  })) as string[];

  if (p.isCancel(providers)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  // Available models for each provider (matching frontend options)
  const anthropicModels = [
    { label: 'Claude Opus 4.6', value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6 },
    { label: 'Claude Opus 4.5', value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_5 },
    { label: 'Claude Opus 4.1', value: ANTHROPIC_MODELS.CLAUDE_OPUS_4_1 },
    { label: 'Claude Sonnet 4.5', value: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5 },
    { label: 'Claude Sonnet 4', value: ANTHROPIC_MODELS.CLAUDE_SONNET_4 },
    { label: 'Claude Haiku 4.5', value: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5 },
    { label: 'Claude Haiku 3.5', value: ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU },
  ];

  const openaiModels = [
    { label: 'GPT-5.2', value: OPENAI_MODELS.GPT_5_2 },
    { label: 'GPT-5.1', value: OPENAI_MODELS.GPT_5_1 },
    { label: 'GPT-4.1', value: OPENAI_MODELS.GPT_4_1 },
    { label: 'GPT-4.1 Mini', value: OPENAI_MODELS.GPT_4_1_MINI },
    { label: 'GPT-4.1 Nano', value: OPENAI_MODELS.GPT_4_1_NANO },
    { label: 'GPT-5', value: OPENAI_MODELS.GPT_5 },
    { label: 'GPT-5 Mini', value: OPENAI_MODELS.GPT_5_MINI },
    { label: 'GPT-5 Nano', value: OPENAI_MODELS.GPT_5_NANO },
  ];

  const googleModels = [
    { label: 'Gemini 3 Pro Preview', value: GOOGLE_MODELS.GEMINI_3_PRO_PREVIEW },
    { label: 'Gemini 3 Flash Preview', value: GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW },
    { label: 'Gemini 2.5 Pro', value: GOOGLE_MODELS.GEMINI_2_5_PRO },
    { label: 'Gemini 2.5 Flash', value: GOOGLE_MODELS.GEMINI_2_5_FLASH },
    { label: 'Gemini 2.5 Flash Lite', value: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE },
  ];

  // Handle Azure configuration if selected
  const azureConfigs: any = {};
  if (providers.includes('azure')) {
    p.note('Azure OpenAI requires custom deployment configuration.');

    const deploymentName = await p.text({
      message: 'Enter your Azure deployment name:',
      placeholder: 'my-gpt-4o-deployment',
      validate: (value) => {
        if (!value?.trim()) return 'Deployment name is required';
      },
    });

    if (p.isCancel(deploymentName)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    const connectionMethod = await p.select({
      message: 'How would you like to connect to Azure?',
      options: [
        { value: 'resource', label: 'Azure Resource Name (recommended)' },
        { value: 'url', label: 'Custom Base URL' },
      ],
    });

    if (p.isCancel(connectionMethod)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    if (connectionMethod === 'resource') {
      const resourceName = await p.text({
        message: 'Enter your Azure resource name:',
        placeholder: 'your-azure-resource',
        validate: (value) => {
          if (!value?.trim()) return 'Resource name is required';
        },
      });

      if (p.isCancel(resourceName)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }

      azureConfigs.resourceName = resourceName;
    } else {
      const baseURL = await p.text({
        message: 'Enter your Azure base URL:',
        placeholder: 'https://your-endpoint.openai.azure.com/openai',
        validate: (value) => {
          if (!value?.trim()) return 'Base URL is required';
          if (!value.startsWith('https://')) return 'Base URL must start with https://';
        },
      });

      if (p.isCancel(baseURL)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }

      azureConfigs.baseURL = baseURL;
    }

    azureConfigs.deploymentName = deploymentName;
    azureConfigs.model = `azure/${deploymentName}`;
  }

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
  if (providers.includes('azure') && azureConfigs.model) {
    availableModels.push({
      label: `${azureConfigs.deploymentName} (Azure)`,
      value: azureConfigs.model,
    });
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

  const configureSummarizer = await p.confirm({
    message: 'Would you like to configure a separate model for summaries and status updates?',
    initialValue: false,
  });

  if (p.isCancel(configureSummarizer)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  let summarizerModel: string | null = null;

  if (configureSummarizer) {
    const optionalChoices = [...availableModels, { label: 'Use base model', value: null }];

    const summarizerResponse = await p.select({
      message: 'Select your model for summaries and status updates (or use base model):',
      options: optionalChoices,
    });

    if (p.isCancel(summarizerResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    summarizerModel = summarizerResponse as string | null;
  }

  // Helper function to add Azure provider options if needed
  const addProviderOptions = (model: string) => {
    if (model.startsWith('azure/') && (azureConfigs.resourceName || azureConfigs.baseURL)) {
      const providerOptions: any = {};
      if (azureConfigs.resourceName) {
        providerOptions.resourceName = azureConfigs.resourceName;
      }
      if (azureConfigs.baseURL) {
        providerOptions.baseURL = azureConfigs.baseURL;
      }
      return providerOptions;
    }
    return undefined;
  };

  // Build model settings object
  const modelSettings: any = {
    base: {
      model: baseModel,
    },
  };

  // Add Azure provider options to base model if needed
  const baseProviderOptions = addProviderOptions(baseModel);
  if (baseProviderOptions) {
    modelSettings.base.providerOptions = baseProviderOptions;
  }

  // Add summarizer model if configured
  if (summarizerModel) {
    modelSettings.summarizer = {
      model: summarizerModel,
    };

    const summarizerProviderOptions = addProviderOptions(summarizerModel);
    if (summarizerProviderOptions) {
      modelSettings.summarizer.providerOptions = summarizerProviderOptions;
    }
  }

  return { modelSettings };
}
