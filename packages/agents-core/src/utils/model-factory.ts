import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGateway, gateway } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter, openrouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel, Provider } from 'ai';

import type { ModelSettings } from '../validation/schemas';
import { getLogger } from './logger';

const logger = getLogger('ModelFactory');

// NVIDIA NIM default provider instance
const nimDefault = createOpenAICompatible({
  name: 'nim',
  baseURL: 'https://integrate.api.nvidia.com/v1',
  headers: {
    Authorization: `Bearer ${process.env.NIM_API_KEY}`,
  },
});

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
      case 'nim': {
        // Merge custom config with default NIM configuration
        const nimConfig = {
          name: 'nim',
          baseURL: 'https://integrate.api.nvidia.com/v1',
          headers: {
            Authorization: `Bearer ${process.env.NIM_API_KEY}`,
          },
          ...config,
        };
        return createOpenAICompatible(nimConfig);
      }
      case 'custom': {
        // Custom OpenAI-compatible provider - requires baseURL in config
        if (!config.baseURL && !config.baseUrl) {
          throw new Error(
            'Custom provider requires baseURL. Please provide it in providerOptions.baseURL or providerOptions.baseUrl'
          );
        }
        const customConfig = {
          name: 'custom',
          baseURL: (config.baseURL || config.baseUrl) as string,
          headers: {
            ...(process.env.CUSTOM_LLM_API_KEY && {
              Authorization: `Bearer ${process.env.CUSTOM_LLM_API_KEY}`,
            }),
            ...((config as any).headers || {}),
          },
          ...config,
        };
        logger.info(
          {
            config: {
              baseURL: customConfig.baseURL,
              hasApiKey: !!process.env.CUSTOM_LLM_API_KEY,
              apiKeyPrefix: process.env.CUSTOM_LLM_API_KEY?.substring(0, 10) + '...',
              headers: Object.keys(customConfig.headers || {}),
            },
          },
          'Creating custom OpenAI-compatible provider'
        );
        return createOpenAICompatible(customConfig);
      }
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

    if (providerOptions.nim) {
      Object.assign(providerConfig, providerOptions.nim);
    }

    if (providerOptions.custom) {
      Object.assign(providerConfig, providerOptions.custom);
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
      case 'nim':
        return nimDefault(modelName);
      case 'custom':
        throw new Error(
          'Custom provider requires configuration. Please provide baseURL in providerOptions.custom.baseURL or providerOptions.baseURL'
        );
      default:
        throw new Error(
          `Unsupported provider: ${provider}. ` +
            `Supported providers are: ${ModelFactory.BUILT_IN_PROVIDERS.join(', ')}. ` +
            `To access other models, use OpenRouter (openrouter/model-id), Vercel AI Gateway (gateway/model-id), NVIDIA NIM (nim/model-id), or Custom OpenAI-compatible (custom/model-id).`
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
    'nim',
    'custom',
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
            `To access other models, use OpenRouter (openrouter/model-id), Vercel AI Gateway (gateway/model-id), NVIDIA NIM (nim/model-id), or Custom OpenAI-compatible (custom/model-id).`
        );
      }

      return {
        provider: normalizedProvider,
        modelName: modelParts.join('/'),
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

  /**
   * Validate model settingsuration
   * Basic validation only - let AI SDK handle parameter-specific validation
   */
  static validateConfig(config: ModelSettings): string[] {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Model name is required');
    }

    if (config.providerOptions) {
      if (config.providerOptions.apiKey) {
        errors.push(
          'API keys should not be stored in provider options. ' +
            'Use environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY) or credential store instead.'
        );
      }

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
