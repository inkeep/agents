import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGateway, gateway } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { createOpenRouter, openrouter } from '@openrouter/ai-sdk-provider';
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
      case 'openrouter':
        return {
          ...createOpenRouter(config),
          textEmbeddingModel: () => {
            throw new Error('OpenRouter does not support text embeddings');
          },
          imageModel: () => {
            throw new Error('OpenRouter does not support image generation');
          },
        };
      case 'gateway':
        return createGateway(config);
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

    if (providerOptions.baseUrl || providerOptions.baseURL) {
      providerConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    if (providerOptions.gateway) {
      Object.assign(providerConfig, providerOptions.gateway);
    }

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

    const providerConfig = ModelFactory.extractProviderConfig(modelSettings.providerOptions);

    if (Object.keys(providerConfig).length > 0) {
      logger.info({ config: providerConfig }, `Applying custom ${provider} provider configuration`);
      const customProvider = ModelFactory.createProvider(provider, providerConfig);
      return customProvider.languageModel(modelName);
    }

    switch (provider) {
      case 'anthropic':
        return anthropic(modelName);
      case 'openai':
        return openai(modelName);
      case 'google':
        return google(modelName);
      case 'openrouter':
        return openrouter(modelName);
      case 'gateway':
        return gateway(modelName);
      default:
        throw new Error(
          `Unsupported provider: ${provider}. ` +
            `Supported providers are: ${ModelFactory.BUILT_IN_PROVIDERS.join(', ')}. ` +
            `To access other models, use OpenRouter (openrouter/model-id) or Vercel AI Gateway (gateway/model-id).`
        );
    }
  }

  /**
   * Built-in providers that have special handling
   */
  private static readonly BUILT_IN_PROVIDERS = [
    'anthropic',
    'openai',
    'google',
    'openrouter',
    'gateway',
  ] as const;

  /**
   * Parse model string to extract provider and model name
   * Examples: "anthropic/claude-sonnet-4" -> { provider: "anthropic", modelName: "claude-sonnet-4" }
   *          "openrouter/anthropic/claude-sonnet-4" -> { provider: "openrouter", modelName: "anthropic/claude-sonnet-4" }
   *          "claude-sonnet-4" -> { provider: "anthropic", modelName: "claude-sonnet-4" } (default to anthropic)
   */
  static parseModelString(modelString: string): { provider: string; modelName: string } {
    if (modelString.includes('/')) {
      const [provider, ...modelParts] = modelString.split('/');
      const normalizedProvider = provider.toLowerCase();

      if (!ModelFactory.BUILT_IN_PROVIDERS.includes(normalizedProvider as any)) {
        throw new Error(
          `Unsupported provider: ${normalizedProvider}. ` +
            `Supported providers are: ${ModelFactory.BUILT_IN_PROVIDERS.join(', ')}. ` +
            `To access other models, use OpenRouter (openrouter/model-id) or Vercel AI Gateway (gateway/model-id).`
        );
      }

      return {
        provider: normalizedProvider,
        modelName: modelParts.join('/'), // In case model name has slashes
      };
    }

    throw new Error(`No provider specified in model string: ${modelString}`);
  }

  /**
   * Get generation parameters from provider options
   * These are parameters that get passed to generateText/streamText calls
   */
  static getGenerationParams(providerOptions?: Record<string, unknown>): Record<string, unknown> {
    if (!providerOptions) {
      return {};
    }

    const excludedKeys = ['apiKey', 'baseURL', 'baseUrl', 'maxDuration'];

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

    const model = ModelFactory.createModel({
      model: modelString,
      providerOptions: modelSettings?.providerOptions,
    });

    const generationParams = ModelFactory.getGenerationParams(modelSettings?.providerOptions);

    const maxDuration = modelSettings?.providerOptions?.maxDuration as number | undefined;

    return {
      model,
      ...generationParams,
      ...(maxDuration !== undefined && { maxDuration }),
    };
  }
}
