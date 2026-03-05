import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createGateway, gateway } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { JSONObject } from '@ai-sdk/provider';
import { createOpenRouter, openrouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

import type { ModelSettings } from '../validation/schemas.js';
import { getLogger } from './logger';
import { createMockModel } from './mock-provider.js';

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
   * Returns a provider with at least languageModel method
   */
  private static createProvider(
    provider: string,
    config: Record<string, unknown>
  ): { languageModel: (modelId: string) => LanguageModel } {
    switch (provider) {
      case 'anthropic':
        return createAnthropic(config);
      case 'azure': {
        if (!config.resourceName && !config.baseURL) {
          const hasApiKey = !!process.env.AZURE_OPENAI_API_KEY;
          const errorMessage = hasApiKey
            ? 'Azure provider requires either resourceName or baseURL in provider options. ' +
              'Provide resourceName for standard Azure OpenAI, or baseURL for custom endpoints.'
            : 'Azure provider requires either resourceName or baseURL in provider options, ' +
              'and AZURE_OPENAI_API_KEY environment variable must be set. ' +
              'Provide resourceName for standard Azure OpenAI, or baseURL for custom endpoints.';

          throw new Error(errorMessage);
        }
        return createAzure(config) as unknown as {
          languageModel: (modelId: string) => LanguageModel;
        };
      }
      case 'openai':
        return createOpenAI(config);
      case 'google':
        return createGoogleGenerativeAI(config);
      case 'openrouter':
        return createOpenRouter(config);
      case 'gateway':
        return createGateway(config);
      case 'nim': {
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
              apiKeyPrefix: `${process.env.CUSTOM_LLM_API_KEY?.substring(0, 10)}...`,
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
   * Only includes settings that go to the provider constructor (baseURL, headers, etc.)
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

    if (providerOptions.headers) {
      providerConfig.headers = providerOptions.headers;
    }

    if (providerOptions.resourceName) {
      providerConfig.resourceName = providerOptions.resourceName;
    }

    if (providerOptions.apiVersion) {
      providerConfig.apiVersion = providerOptions.apiVersion;
    }

    return providerConfig;
  }

  /**
   * Extract per-call provider options to pass as providerOptions in streamText/generateText.
   * Any object-valued key (except constructor config keys like headers) is treated as
   * a provider-specific per-call option, e.g. anthropic.thinking, gateway.models.
   * @deprecated Use classifyProviderOptions().providerSpecificOptions instead
   */
  static extractStreamProviderOptions(
    providerOptions?: Record<string, unknown>
  ): Record<string, JSONObject> | undefined {
    if (!providerOptions) {
      return undefined;
    }

    const constructorObjectKeys = new Set(['headers']);
    const result: Record<string, JSONObject> = {};

    for (const [key, value] of Object.entries(providerOptions)) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !constructorObjectKeys.has(key)
      ) {
        result[key] = value as JSONObject;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
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

    // Azure always needs custom configuration; mock never does
    if (provider !== 'mock' && (provider === 'azure' || Object.keys(providerConfig).length > 0)) {
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
      case 'mock':
        return createMockModel(modelName) as unknown as LanguageModel;
      case 'custom':
        throw new Error(
          'Custom provider requires configuration. Please provide baseURL in providerOptions.baseURL'
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
   * Keys that belong to provider constructor config (handled by extractProviderConfig)
   */
  private static readonly CONSTRUCTOR_KEYS = new Set([
    'apiKey',
    'baseURL',
    'baseUrl',
    'headers',
    'resourceName',
    'apiVersion',
  ]);

  /**
   * Keys that are extracted but not forwarded as generation params
   */
  private static readonly META_KEYS = new Set(['contextWindowSize']);

  /**
   * Known AI SDK provider namespaces — when a key matches one of these
   * and the value is an object, it goes into providerOptions
   */
  private static readonly PROVIDER_NAMES = new Set([
    'anthropic',
    'openai',
    'google',
    'azure',
    'openrouter',
  ]);

  /**
   * Built-in providers that have special handling
   */
  private static readonly BUILT_IN_PROVIDERS = [
    'anthropic',
    'azure',
    'openai',
    'google',
    'openrouter',
    'gateway',
    'nim',
    'custom',
    'mock',
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
   * Classify flat providerOptions into three buckets:
   * 1. generationParams — top-level AI SDK params (temperature, topP, etc.)
   * 2. providerSpecificOptions — nested under providerOptions on AI SDK calls
   * 3. maxDuration — extracted separately
   *
   * Constructor config keys (baseURL, headers, etc.) are skipped — they are
   * handled by extractProviderConfig().
   */
  static classifyProviderOptions(providerOptions?: Record<string, unknown>): {
    generationParams: Record<string, unknown>;
    providerSpecificOptions: Record<string, Record<string, unknown>>;
    maxDuration: number | undefined;
  } {
    const generationParams: Record<string, unknown> = {};
    const providerSpecificOptions: Record<string, Record<string, unknown>> = {};
    let maxDuration: number | undefined;

    if (!providerOptions) {
      return { generationParams, providerSpecificOptions, maxDuration };
    }

    for (const [key, value] of Object.entries(providerOptions)) {
      if (value === undefined) continue;

      if (ModelFactory.CONSTRUCTOR_KEYS.has(key)) {
        // Skip — handled by extractProviderConfig()
      } else if (key === 'maxDuration') {
        maxDuration = value as number;
      } else if (ModelFactory.META_KEYS.has(key)) {
        // Skip — extracted but not forwarded (e.g., contextWindowSize)
      } else if (
        ModelFactory.PROVIDER_NAMES.has(key) &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        providerSpecificOptions[key] = value as Record<string, unknown>;
      } else if (key === 'nim' || key === 'custom' || key === 'gateway') {
        // Skip — these are constructor config for their respective providers
        // Already handled by extractProviderConfig()
      } else {
        generationParams[key] = value;
      }
    }

    return { generationParams, providerSpecificOptions, maxDuration };
  }

  /** @deprecated Use classifyProviderOptions() instead */
  static getGenerationParams(providerOptions?: Record<string, unknown>): Record<string, unknown> {
    return ModelFactory.classifyProviderOptions(providerOptions).generationParams;
  }

  /**
   * Prepare complete generation configuration from model settings
   * Returns model instance and generation parameters ready to spread into generateText/streamText
   * Provider-specific options (anthropic.thinking, openai.reasoningEffort, etc.) are correctly
   * nested under the providerOptions key as required by the AI SDK.
   */
  static prepareGenerationConfig(modelSettings?: ModelSettings): {
    model: LanguageModel;
    providerOptions?: Record<string, Record<string, unknown>>;
    maxDuration?: number;
  } & Record<string, unknown> {
    const modelString = modelSettings?.model?.trim();

    const model = ModelFactory.createModel({
      model: modelString,
      providerOptions: modelSettings?.providerOptions,
    });

    const { generationParams, providerSpecificOptions, maxDuration } =
      ModelFactory.classifyProviderOptions(modelSettings?.providerOptions);

    return {
      model,
      ...generationParams,
      ...(Object.keys(providerSpecificOptions).length > 0 && {
        providerOptions: providerSpecificOptions,
      }),
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
