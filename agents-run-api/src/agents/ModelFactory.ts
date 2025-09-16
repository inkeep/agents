import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { getLogger } from '../logger';

const logger = getLogger('ModelFactory');

export interface ModelSettings {
  model?: string;
  providerOptions?: Record<string, unknown>;
}

/**
 * Factory for creating AI SDK language models from configuration
 * Supports multiple providers and AI Gateway integration
 */
export class ModelFactory {
  /**
   * Create a language model instance from configuration
   * Throws error if no config provided - models must be configured at project level
   */
  static createModel(config: ModelSettings): LanguageModel {
    if (!config?.model?.trim()) {
      throw new Error(
        'Model configuration is required. Please configure models at the project level.'
      );
    }

    const modelSettings = config;
    const modelString = modelSettings.model!.trim();
    const { provider, modelName } = ModelFactory.parseModelString(modelString);

    logger.debug(
      {
        provider,
        model: modelName,
        fullModelString: modelSettings.model,
        hasProviderOptions: !!modelSettings.providerOptions,
      },
      'Creating language model from config'
    );

    try {
      switch (provider) {
        case 'anthropic':
          return ModelFactory.createAnthropicModel(modelName, modelSettings.providerOptions);

        case 'openai':
          return ModelFactory.createOpenAIModel(modelName, modelSettings.providerOptions);

        case 'gemini':
          return ModelFactory.createGeminiModel(modelName, modelSettings.providerOptions);

        default:
          throw new Error(
            `Unsupported provider: ${provider}. Supported providers are: ${ModelFactory.SUPPORTED_PROVIDERS.join(', ')}`
          );
      }
    } catch (error) {
      logger.error(
        {
          provider,
          model: modelName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to create model'
      );

      // Re-throw the error instead of falling back to a default
      throw new Error(
        `Failed to create model ${modelString}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Supported providers for security validation
   */
  private static readonly SUPPORTED_PROVIDERS = ['anthropic', 'openai'] as const;

  /**
   * Parse model string to extract provider and model name
   * Examples: "anthropic/claude-4-sonnet" -> { provider: "anthropic", modelName: "claude-4-sonnet" }
   *          "claude-4-sonnet" -> { provider: "anthropic", modelName: "claude-4-sonnet" } (default to anthropic)
   */
  static parseModelString(modelString: string): { provider: string; modelName: string } {
    // Handle format like "provider/model-name"
    if (modelString.includes('/')) {
      const [provider, ...modelParts] = modelString.split('/');
      const normalizedProvider = provider.toLowerCase();

      // Validate provider is supported
      if (!ModelFactory.SUPPORTED_PROVIDERS.includes(normalizedProvider as any)) {
        logger.warn(
          { provider: normalizedProvider, modelName: modelParts.join('/') },
          'Unsupported provider detected, falling back to anthropic'
        );
        return {
          provider: 'anthropic',
          modelName: modelParts.join('/'),
        };
      }

      return {
        provider: normalizedProvider,
        modelName: modelParts.join('/'), // In case model name has slashes
      };
    }

    // Default to anthropic if no provider specified
    return {
      provider: 'anthropic',
      modelName: modelString,
    };
  }

  /**
   * Create an Anthropic model instance
   */
  private static createAnthropicModel(
    modelName: string,
    providerOptions?: Record<string, unknown>
  ): LanguageModel {
    const anthropicConfig: any = {};

    // Extract provider configuration (baseURL, etc.)
    // Note: API keys should be provided via environment variables, not in configuration

    if (providerOptions?.baseUrl || providerOptions?.baseURL) {
      anthropicConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    // Handle AI Gateway configuration if present
    if (providerOptions?.gateway) {
      logger.info(
        { gateway: providerOptions.gateway },
        'Setting up AI Gateway for Anthropic model'
      );
      // AI Gateway configuration would go here
      // This depends on the specific gateway implementation
      Object.assign(anthropicConfig, providerOptions.gateway);
    }

    // For AI SDK v5, model parameters like temperature are passed to generateText/streamText,
    // not to the model constructor. Only provider config (apiKey, baseURL) goes to the provider.

    if (Object.keys(anthropicConfig).length > 0) {
      logger.info({ config: anthropicConfig }, 'Applying custom Anthropic provider configuration');
      // In AI SDK v5, use createAnthropic for custom config
      const provider = createAnthropic(anthropicConfig);
      return provider(modelName);
    }

    return anthropic(modelName);
  }

  /**
   * Create an OpenAI model instance
   */
  private static createOpenAIModel(
    modelName: string,
    providerOptions?: Record<string, unknown>
  ): LanguageModel {
    const openaiConfig: any = {};

    // Extract provider configuration (baseURL, etc.)
    // Note: API keys should be provided via environment variables, not in configuration

    if (providerOptions?.baseUrl || providerOptions?.baseURL) {
      openaiConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    // Handle AI Gateway configuration if present
    if (providerOptions?.gateway) {
      logger.info({ gateway: providerOptions.gateway }, 'Setting up AI Gateway for OpenAI model');
      Object.assign(openaiConfig, providerOptions.gateway);
    }

    // For AI SDK v5, model parameters like temperature are passed to generateText/streamText,
    // not to the model constructor. Only provider config (apiKey, baseURL) goes to the provider.

    if (Object.keys(openaiConfig).length > 0) {
      logger.info({ config: openaiConfig }, 'Applying custom OpenAI provider configuration');
      // In AI SDK v5, use createOpenAI for custom config
      const provider = createOpenAI(openaiConfig);
      return provider(modelName);
    }

    return openai(modelName);
  }

  /**
   * Create an OpenAI model instance
   */
  private static createGeminiModel(
    modelName: string,
    providerOptions?: Record<string, unknown>
  ): LanguageModel {
    const geminiConfig: any = {};
    // Extract provider configuration (baseURL, etc.)
    // Note: API keys should be provided via environment variables, not in configuration

    if (providerOptions?.baseUrl || providerOptions?.baseURL) {
      geminiConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    // Handle AI Gateway configuration if present
    if (providerOptions?.gateway) {
      logger.info({ gateway: providerOptions.gateway }, 'Setting up AI Gateway for Gemini model');
      Object.assign(geminiConfig, providerOptions.gateway);
    }

    // For AI SDK v5, model parameters like temperature are passed to generateText/streamText,
    // not to the model constructor. Only provider config (apiKey, baseURL) goes to the provider.

    if (Object.keys(geminiConfig).length > 0) {
      logger.info({ config: geminiConfig }, 'Applying custom Gemini provider configuration');
      // In AI SDK v5, use createGoogleGenerativeAI for custom config
      const provider = createGoogleGenerativeAI(geminiConfig);
      return provider(modelName);
    }

    return google(modelName);
  }

  /**
   * Get generation parameters from provider options
   * These are parameters that get passed to generateText/streamText calls
   */
  static getGenerationParams(providerOptions?: Record<string, unknown>): Record<string, unknown> {
    if (!providerOptions) {
      return {};
    }

    // Exclude provider config items (these go to createProvider, not generateText/streamText)
    // Also exclude maxDuration as it's handled separately for timeouts
    const excludedKeys = ['apiKey', 'baseURL', 'baseUrl', 'maxDuration'];

    // Return all config except excluded items
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(providerOptions)) {
      if (!excludedKeys.includes(key) && value !== undefined) {
        params[key] = value;
      }
    }

    return params;
  }

  /**
   * Prepare complete generation configuration from model settings
   * Returns model instance and generation parameters ready to spread into generateText/streamText
   * Includes maxDuration if specified in provider options (in seconds, following Vercel standard)
   */
  static prepareGenerationConfig(modelSettings?: ModelSettings): {
    model: LanguageModel;
    maxDuration?: number;
  } & Record<string, unknown> {
    const modelString = modelSettings?.model?.trim() || 'anthropic/claude-4-sonnet-20250514';

    // Create the model instance
    const model = ModelFactory.createModel({
      model: modelString,
      providerOptions: modelSettings?.providerOptions,
    });

    // Get generation parameters (excludes maxDuration)
    const generationParams = ModelFactory.getGenerationParams(modelSettings?.providerOptions);

    // Extract maxDuration if present (Vercel standard, in seconds)
    const maxDuration = modelSettings?.providerOptions?.maxDuration as number | undefined;

    return {
      model,
      ...generationParams,
      ...(maxDuration !== undefined && { maxDuration }),
    };
  }

  /**
   * Validate model settingsuration
   * Basic validation only - let AI SDK handle parameter-specific validation
   */
  static validateConfig(config: ModelSettings): string[] {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Model name is required');
    }

    // Validate provider options structure if present
    if (config.providerOptions) {
      // Security validation: Check for API keys in configuration
      if (config.providerOptions.apiKey) {
        errors.push(
          'API keys should not be stored in provider options. ' +
            'Use environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY) or credential store instead.'
        );
      }

      // Validate maxDuration if present
      if (config.providerOptions.maxDuration !== undefined) {
        const maxDuration = config.providerOptions.maxDuration;
        if (typeof maxDuration !== 'number' || maxDuration <= 0) {
          errors.push('maxDuration must be a positive number (in seconds)');
        }
      }
    }

    return errors;
  }
}
