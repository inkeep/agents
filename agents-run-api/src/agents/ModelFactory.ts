import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { LanguageModel, Provider } from 'ai';
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
   * Create a provider instance with custom configuration
   */
  private static createProvider(provider: string, config: Record<string, unknown>): Provider {
    switch (provider) {
      case 'anthropic':
        return createAnthropic(config);
      case 'openai':
        return createOpenAI(config);
      case 'google':
        return createGoogleGenerativeAI(config);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Extract provider configuration from providerOptions
   * Only includes settings that go to the provider constructor (baseURL, apiKey, etc.)
   */
  private static extractProviderConfig(
    providerOptions?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!providerOptions) {
      return {};
    }

    const providerConfig: Record<string, unknown> = {};

    // Handle baseURL variations
    if (providerOptions.baseUrl || providerOptions.baseURL) {
      providerConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    // Handle AI Gateway configuration if present
    if (providerOptions.gateway) {
      Object.assign(providerConfig, providerOptions.gateway);
    }

    // Note: API keys should come from environment variables, not configuration

    return providerConfig;
  }

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
    if (!modelSettings.model) {
      throw new Error('Model configuration is required');
    }
    const modelString = modelSettings.model.trim();
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

    // Extract provider configuration from providerOptions
    const providerConfig = ModelFactory.extractProviderConfig(modelSettings.providerOptions);

    // Only create custom provider if there's actual configuration
    if (Object.keys(providerConfig).length > 0) {
      logger.info({ config: providerConfig }, `Applying custom ${provider} provider configuration`);
      const customProvider = ModelFactory.createProvider(provider, providerConfig);
      return customProvider.languageModel(modelName);
    }

    // Use default providers when no custom config
    switch (provider) {
      case 'anthropic':
        return anthropic(modelName);
      case 'openai':
        return openai(modelName);
      case 'google':
        return google(modelName);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Supported providers for security validation
   */
  private static readonly SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;

  /**
   * Parse model string to extract provider and model name
   * Examples: "anthropic/claude-sonnet-4" -> { provider: "anthropic", modelName: "claude-sonnet-4" }
   *          "claude-sonnet-4" -> { provider: "anthropic", modelName: "claude-sonnet-4" } (default to anthropic)
   */
  static parseModelString(modelString: string): { provider: string; modelName: string } {
    // Handle format like "provider/model-name"
    if (modelString.includes('/')) {
      const [provider, ...modelParts] = modelString.split('/');
      const normalizedProvider = provider.toLowerCase();

      // Validate provider is supported
      if (!ModelFactory.SUPPORTED_PROVIDERS.includes(normalizedProvider as any)) {
        logger.error(
          { provider: normalizedProvider, modelName: modelParts.join('/') },
          'Unsupported provider detected, falling back to anthropic'
        );
        throw new Error(
          `Unsupported provider: ${normalizedProvider}. Please provide a model in the format of provider/model-name.`
        );
      }

      return {
        provider: normalizedProvider,
        modelName: modelParts.join('/'), // In case model name has slashes
      };
    }

    throw new Error(
      `Invalid model provided: ${modelString}. Please provide a model in the format of provider/model-name.`
    );
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
    const modelString = modelSettings?.model?.trim();

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
