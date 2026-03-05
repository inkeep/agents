import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ModelFactory } from '../../utils/model-factory';
import type { ModelSettings } from '../../validation/schemas';

// Mock the Azure provider
vi.mock('@ai-sdk/azure', () => ({
  createAzure: vi.fn(() => ({
    languageModel: vi.fn(() => ({ provider: 'azure', model: 'mocked-azure-model' })),
  })),
}));

describe('ModelFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.CUSTOM_LLM_API_KEY;
    delete process.env.NIM_API_KEY;
  });

  describe('parseModelString', () => {
    test('should parse anthropic model string', () => {
      const result = ModelFactory.parseModelString('anthropic/claude-sonnet-4-5');
      expect(result).toEqual({
        provider: 'anthropic',
        modelName: 'claude-sonnet-4-5',
      });
    });

    test('should parse openai model string', () => {
      const result = ModelFactory.parseModelString('openai/gpt-4.1');
      expect(result).toEqual({
        provider: 'openai',
        modelName: 'gpt-4.1',
      });
    });

    test('should parse azure model string', () => {
      const result = ModelFactory.parseModelString('azure/my-gpt4-deployment');
      expect(result).toEqual({
        provider: 'azure',
        modelName: 'my-gpt4-deployment',
      });
    });

    test('should parse google model string', () => {
      const result = ModelFactory.parseModelString('google/gemini-2.5-flash');
      expect(result).toEqual({
        provider: 'google',
        modelName: 'gemini-2.5-flash',
      });
    });

    test('should parse openrouter model string with nested path', () => {
      const result = ModelFactory.parseModelString('openrouter/anthropic/claude-sonnet-4-0');
      expect(result).toEqual({
        provider: 'openrouter',
        modelName: 'anthropic/claude-sonnet-4-0',
      });
    });

    test('should parse gateway model string', () => {
      const result = ModelFactory.parseModelString('gateway/openai/gpt-4.1-mini');
      expect(result).toEqual({
        provider: 'gateway',
        modelName: 'openai/gpt-4.1-mini',
      });
    });

    test('should parse nim model string', () => {
      const result = ModelFactory.parseModelString('nim/nvidia/llama-3.3-nemotron');
      expect(result).toEqual({
        provider: 'nim',
        modelName: 'nvidia/llama-3.3-nemotron',
      });
    });

    test('should parse custom model string', () => {
      const result = ModelFactory.parseModelString('custom/my-custom-model');
      expect(result).toEqual({
        provider: 'custom',
        modelName: 'my-custom-model',
      });
    });

    test('should throw error for unsupported provider', () => {
      expect(() => ModelFactory.parseModelString('unsupported/model')).toThrow(
        'Unsupported provider: unsupported'
      );
    });

    test('should throw error for model string without provider', () => {
      expect(() => ModelFactory.parseModelString('model-without-provider')).toThrow(
        'No provider specified in model string'
      );
    });
  });

  describe('Azure Provider Error Handling', () => {
    test('should throw error when neither resourceName nor baseURL provided and no API key', () => {
      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {},
      };

      expect(() => ModelFactory.createModel(config)).toThrow(
        'Azure provider requires either resourceName or baseURL in provider options, ' +
          'and AZURE_OPENAI_API_KEY environment variable must be set'
      );
    });

    test('should throw error when neither resourceName nor baseURL provided but API key exists', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {},
      };

      expect(() => ModelFactory.createModel(config)).toThrow(
        'Azure provider requires either resourceName or baseURL in provider options. ' +
          'Provide resourceName for standard Azure OpenAI, or baseURL for custom endpoints.'
      );
    });

    test('should extract Azure provider config correctly', () => {
      const providerOptions = {
        resourceName: 'my-resource',
        apiVersion: '2024-10-21',
        temperature: 0.5,
        headers: { 'Custom-Header': 'value' },
        baseURL: 'https://custom.com', // Should be included in provider config
        maxOutputTokens: 2048, // Should NOT be included in provider config
      };

      const extractedConfig = (ModelFactory as any).extractProviderConfig(providerOptions);

      expect(extractedConfig).toEqual({
        resourceName: 'my-resource',
        apiVersion: '2024-10-21',
        headers: { 'Custom-Header': 'value' },
        baseURL: 'https://custom.com',
      });
      expect(extractedConfig).not.toHaveProperty('temperature');
      expect(extractedConfig).not.toHaveProperty('maxOutputTokens');
    });
  });

  describe('Validation', () => {
    test('should validate Azure provider configuration', () => {
      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          resourceName: 'my-resource',
          temperature: 0.7,
        },
      };

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toEqual([]);
    });

    test('should return errors for missing model', () => {
      const config: ModelSettings = { model: '' };
      const errors = ModelFactory.validateConfig(config);
      expect(errors).toContain('Model name is required');
    });

    test('should return errors for API key in provider options', () => {
      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          resourceName: 'my-resource',
          apiKey: 'should-not-be-here',
        },
      };

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toContain(
        'API keys should not be stored in provider options. ' +
          'Use environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY) or credential store instead.'
      );
    });

    test('should return errors for invalid maxDuration', () => {
      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          resourceName: 'my-resource',
          maxDuration: -1,
        },
      };

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toContain('maxDuration must be a positive number (in seconds)');
    });
  });

  describe('Generation Parameters', () => {
    test('should extract generation parameters excluding provider config and object values', () => {
      const providerOptions = {
        resourceName: 'my-resource',
        apiVersion: '2024-10-21',
        baseURL: 'https://custom.com',
        headers: { Custom: 'value' },
        anthropic: { thinking: { type: 'enabled', budgetTokens: 8000 } },
        openai: { reasoningEffort: 'medium' },
        gateway: { models: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4-5'] },
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.9,
      };

      const params = ModelFactory.getGenerationParams(providerOptions);

      expect(params).toEqual({
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.9,
      });
      expect(params).not.toHaveProperty('resourceName');
      expect(params).not.toHaveProperty('apiVersion');
      expect(params).not.toHaveProperty('baseURL');
      expect(params).not.toHaveProperty('headers');
      expect(params).not.toHaveProperty('anthropic');
      expect(params).not.toHaveProperty('openai');
      expect(params).not.toHaveProperty('gateway');
    });

    test('should return empty object for null provider options', () => {
      const params = ModelFactory.getGenerationParams(undefined);
      expect(params).toEqual({});
    });
  });

  describe('extractStreamProviderOptions', () => {
    test('should extract anthropic per-call options', () => {
      const providerOptions = {
        temperature: 0.7,
        anthropic: { thinking: { type: 'enabled', budgetTokens: 8000 } },
      };
      const result = ModelFactory.extractStreamProviderOptions(providerOptions);
      expect(result).toEqual({ anthropic: { thinking: { type: 'enabled', budgetTokens: 8000 } } });
    });

    test('should extract openai per-call options', () => {
      const providerOptions = {
        maxOutputTokens: 4096,
        openai: { reasoningEffort: 'medium' },
      };
      const result = ModelFactory.extractStreamProviderOptions(providerOptions);
      expect(result).toEqual({ openai: { reasoningEffort: 'medium' } });
    });

    test('should extract gateway per-call options including arrays', () => {
      const providerOptions = {
        gateway: { models: ['openai/gpt-5-2', 'gemini-2.0-flash'] },
      };
      const result = ModelFactory.extractStreamProviderOptions(providerOptions);
      expect(result).toEqual({ gateway: { models: ['openai/gpt-5-2', 'gemini-2.0-flash'] } });
    });

    test('should extract multiple provider options at once', () => {
      const providerOptions = {
        temperature: 0.7,
        anthropic: { cacheControl: { type: 'ephemeral' } },
        gateway: { models: ['openai/gpt-4.1'] },
      };
      const result = ModelFactory.extractStreamProviderOptions(providerOptions);
      expect(result).toEqual({
        anthropic: { cacheControl: { type: 'ephemeral' } },
        gateway: { models: ['openai/gpt-4.1'] },
      });
    });

    test('should not include headers in stream provider options', () => {
      const providerOptions = {
        headers: { Authorization: 'Bearer token' },
        anthropic: { thinking: { type: 'enabled', budgetTokens: 5000 } },
      };
      const result = ModelFactory.extractStreamProviderOptions(providerOptions);
      expect(result).toEqual({ anthropic: { thinking: { type: 'enabled', budgetTokens: 5000 } } });
      expect(result).not.toHaveProperty('headers');
    });

    test('should return undefined when no provider options present', () => {
      expect(ModelFactory.extractStreamProviderOptions(undefined)).toBeUndefined();
      expect(
        ModelFactory.extractStreamProviderOptions({ temperature: 0.7, maxOutputTokens: 2048 })
      ).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should throw error for missing model configuration', () => {
      expect(() => ModelFactory.createModel({} as ModelSettings)).toThrow(
        'Model configuration is required'
      );
    });

    test('should throw error for custom provider without baseURL', () => {
      const config: ModelSettings = {
        model: 'custom/my-model',
        providerOptions: { temperature: 0.7 },
      };

      expect(() => ModelFactory.createModel(config)).toThrow(
        'Custom provider requires configuration. Please provide baseURL in providerOptions.baseURL'
      );
    });

    test('should throw error for unsupported provider in createModel', () => {
      const config: ModelSettings = { model: 'unsupported/model' };

      expect(() => ModelFactory.createModel(config)).toThrow('Unsupported provider: unsupported');
    });
  });

  describe('Azure Model Creation', () => {
    test('should create Azure model with resourceName', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          resourceName: 'my-resource',
          apiVersion: '2024-10-21',
          temperature: 0.7,
        },
      };

      const model = ModelFactory.createModel(config);
      expect(model).toBeDefined();
      expect(model).toMatchObject({
        provider: 'azure',
        model: 'mocked-azure-model',
      });
    });

    test('should create Azure model with baseURL', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          baseURL: 'https://my-resource.openai.azure.com',
          apiVersion: '2024-10-21',
          temperature: 0.7,
        },
      };

      const model = ModelFactory.createModel(config);
      expect(model).toBeDefined();
      expect(model).toMatchObject({
        provider: 'azure',
        model: 'mocked-azure-model',
      });
    });

    test('should create Azure model with both resourceName and baseURL (baseURL takes precedence)', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          resourceName: 'my-resource',
          baseURL: 'https://custom-endpoint.openai.azure.com',
          apiVersion: '2024-10-21',
          temperature: 0.7,
        },
      };

      const model = ModelFactory.createModel(config);
      expect(model).toBeDefined();
      expect(model).toMatchObject({
        provider: 'azure',
        model: 'mocked-azure-model',
      });
    });

    test('should throw error when creating Azure model without resourceName or baseURL and no API key', () => {
      delete process.env.AZURE_OPENAI_API_KEY;

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          apiVersion: '2024-10-21',
          temperature: 0.7,
        },
      };

      expect(() => ModelFactory.createModel(config)).toThrow(
        'Azure provider requires either resourceName or baseURL in provider options, ' +
          'and AZURE_OPENAI_API_KEY environment variable must be set'
      );
    });

    test('should throw error when creating Azure model without resourceName or baseURL but with API key', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          apiVersion: '2024-10-21',
          temperature: 0.7,
        },
      };

      expect(() => ModelFactory.createModel(config)).toThrow(
        'Azure provider requires either resourceName or baseURL in provider options. ' +
          'Provide resourceName for standard Azure OpenAI, or baseURL for custom endpoints.'
      );
    });

    test('should handle prepareGenerationConfig with Azure model and resourceName', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          resourceName: 'my-resource',
          temperature: 0.7,
          maxOutputTokens: 2048,
          maxDuration: 30,
        },
      };

      const result = ModelFactory.prepareGenerationConfig(config);
      expect(result).toMatchObject({
        model: {
          provider: 'azure',
          model: 'mocked-azure-model',
        },
        temperature: 0.7,
        maxOutputTokens: 2048,
        maxDuration: 30,
      });
    });

    test('should include providerOptions in prepareGenerationConfig when provider-specific options present', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          resourceName: 'my-resource',
          temperature: 0.7,
          anthropic: { thinking: { type: 'enabled', budgetTokens: 8000 } },
        },
      };

      const result = ModelFactory.prepareGenerationConfig(config);
      expect(result).toMatchObject({
        temperature: 0.7,
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 8000 } } },
      });
      expect(result).not.toHaveProperty('anthropic');
    });

    test('should handle prepareGenerationConfig with Azure model and baseURL', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const config: ModelSettings = {
        model: 'azure/my-deployment',
        providerOptions: {
          baseURL: 'https://my-resource.openai.azure.com',
          temperature: 0.7,
          maxOutputTokens: 2048,
          maxDuration: 30,
        },
      };

      const result = ModelFactory.prepareGenerationConfig(config);
      expect(result).toMatchObject({
        model: {
          provider: 'azure',
          model: 'mocked-azure-model',
        },
        temperature: 0.7,
        maxOutputTokens: 2048,
        maxDuration: 30,
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle model string with multiple slashes', () => {
      const result = ModelFactory.parseModelString('openrouter/meta-llama/llama-3.1-405b/instruct');
      expect(result).toEqual({
        provider: 'openrouter',
        modelName: 'meta-llama/llama-3.1-405b/instruct',
      });
    });
  });

  describe('classifyProviderOptions', () => {
    test('should separate anthropic thinking into providerSpecificOptions', () => {
      const result = ModelFactory.classifyProviderOptions({
        temperature: 0.7,
        anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
      });
      expect(result.generationParams).toEqual({ temperature: 0.7 });
      expect(result.providerSpecificOptions).toEqual({
        anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
      });
    });

    test('should separate openai reasoningEffort into providerSpecificOptions', () => {
      const result = ModelFactory.classifyProviderOptions({
        openai: { reasoningEffort: 'high' },
      });
      expect(result.providerSpecificOptions).toEqual({
        openai: { reasoningEffort: 'high' },
      });
      expect(result.generationParams).toEqual({});
    });

    test('should separate google thinkingConfig into providerSpecificOptions', () => {
      const result = ModelFactory.classifyProviderOptions({
        google: { thinkingConfig: { thinkingBudget: 5000 } },
      });
      expect(result.providerSpecificOptions).toEqual({
        google: { thinkingConfig: { thinkingBudget: 5000 } },
      });
    });

    test('should handle azure provider options (uses openai namespace)', () => {
      const result = ModelFactory.classifyProviderOptions({
        azure: { someOption: 'value' },
      });
      expect(result.providerSpecificOptions).toEqual({
        azure: { someOption: 'value' },
      });
    });

    test('should skip gateway options (constructor config, like nim/custom)', () => {
      const result = ModelFactory.classifyProviderOptions({
        gateway: { order: ['anthropic', 'openai'], models: ['claude-sonnet-4-0'] },
      });
      expect(result.providerSpecificOptions).toEqual({});
      expect(result.generationParams).toEqual({});
    });

    test('should handle openrouter provider options', () => {
      const result = ModelFactory.classifyProviderOptions({
        openrouter: { reasoning: { effort: 'high' } },
      });
      expect(result.providerSpecificOptions).toEqual({
        openrouter: { reasoning: { effort: 'high' } },
      });
    });

    test('should handle multiple providers simultaneously', () => {
      const result = ModelFactory.classifyProviderOptions({
        temperature: 0.7,
        maxTokens: 4096,
        anthropic: { thinking: { type: 'enabled', budgetTokens: 5000 } },
        openai: { reasoningEffort: 'high' },
      });
      expect(result.generationParams).toEqual({ temperature: 0.7, maxTokens: 4096 });
      expect(result.providerSpecificOptions).toEqual({
        anthropic: { thinking: { type: 'enabled', budgetTokens: 5000 } },
        openai: { reasoningEffort: 'high' },
      });
    });

    test('should skip constructor keys', () => {
      const result = ModelFactory.classifyProviderOptions({
        baseURL: 'https://example.com',
        headers: { 'X-Custom': 'value' },
        apiKey: 'secret',
        resourceName: 'my-resource',
        apiVersion: '2024-10-21',
        temperature: 0.5,
      });
      expect(result.generationParams).toEqual({ temperature: 0.5 });
      expect(result.providerSpecificOptions).toEqual({});
    });

    test('should extract maxDuration', () => {
      const result = ModelFactory.classifyProviderOptions({
        maxDuration: 300,
        temperature: 0.7,
      });
      expect(result.maxDuration).toBe(300);
      expect(result.generationParams).toEqual({ temperature: 0.7 });
    });

    test('should skip contextWindowSize (meta key)', () => {
      const result = ModelFactory.classifyProviderOptions({
        contextWindowSize: 128000,
        temperature: 0.7,
      });
      expect(result.generationParams).toEqual({ temperature: 0.7 });
      expect(result.providerSpecificOptions).toEqual({});
    });

    test('should treat unknown keys as generation params (backward compat)', () => {
      const result = ModelFactory.classifyProviderOptions({
        temperature: 0.7,
        someCustomKey: 'value',
      });
      expect(result.generationParams).toEqual({ temperature: 0.7, someCustomKey: 'value' });
    });

    test('should return empty buckets for undefined input', () => {
      const result = ModelFactory.classifyProviderOptions(undefined);
      expect(result.generationParams).toEqual({});
      expect(result.providerSpecificOptions).toEqual({});
      expect(result.maxDuration).toBeUndefined();
    });

    test('should skip nim, custom, and gateway constructor config keys', () => {
      const result = ModelFactory.classifyProviderOptions({
        nim: { baseURL: 'https://nim.example.com' },
        custom: { baseURL: 'https://custom.example.com' },
        gateway: { order: ['anthropic'] },
      });
      expect(result.generationParams).toEqual({});
      expect(result.providerSpecificOptions).toEqual({});
    });

    test('should not treat arrays as provider-specific options', () => {
      const result = ModelFactory.classifyProviderOptions({
        anthropic: ['a', 'b'],
      });
      expect(result.providerSpecificOptions).toEqual({});
      expect(result.generationParams).toEqual({ anthropic: ['a', 'b'] });
    });

    test('should skip undefined values', () => {
      const result = ModelFactory.classifyProviderOptions({
        temperature: 0.7,
        topP: undefined,
      });
      expect(result.generationParams).toEqual({ temperature: 0.7 });
    });

    test('should not treat provider name as provider-specific when value is not an object', () => {
      const result = ModelFactory.classifyProviderOptions({
        anthropic: 'not-an-object',
      });
      expect(result.providerSpecificOptions).toEqual({});
      expect(result.generationParams).toEqual({ anthropic: 'not-an-object' });
    });

    test('should not treat provider name as provider-specific when value is null', () => {
      const result = ModelFactory.classifyProviderOptions({
        anthropic: null,
      });
      expect(result.providerSpecificOptions).toEqual({});
      expect(result.generationParams).toEqual({ anthropic: null });
    });
  });

  describe('prepareGenerationConfig - providerOptions forwarding', () => {
    test('should nest anthropic options under providerOptions key', () => {
      process.env.AZURE_OPENAI_API_KEY = 'test-key';

      const result = ModelFactory.prepareGenerationConfig({
        model: 'mock/test',
        providerOptions: {
          temperature: 0.7,
          anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
        },
      });
      expect(result.providerOptions).toEqual({
        anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
      });
      expect(result.temperature).toBe(0.7);
      expect(result).not.toHaveProperty('anthropic');
    });

    test('should not include providerOptions key when no provider-specific options', () => {
      const result = ModelFactory.prepareGenerationConfig({
        model: 'mock/test',
        providerOptions: { temperature: 0.7 },
      });
      expect(result).not.toHaveProperty('providerOptions');
      expect(result.temperature).toBe(0.7);
    });

    test('should handle multiple provider options together', () => {
      const result = ModelFactory.prepareGenerationConfig({
        model: 'mock/test',
        providerOptions: {
          temperature: 0.5,
          anthropic: { thinking: { type: 'enabled', budgetTokens: 5000 } },
          openai: { reasoningEffort: 'high' },
        },
      });
      expect(result.providerOptions).toEqual({
        anthropic: { thinking: { type: 'enabled', budgetTokens: 5000 } },
        openai: { reasoningEffort: 'high' },
      });
      expect(result.temperature).toBe(0.5);
    });

    test('should include maxDuration when specified', () => {
      const result = ModelFactory.prepareGenerationConfig({
        model: 'mock/test',
        providerOptions: {
          temperature: 0.7,
          maxDuration: 60,
        },
      });
      expect(result.maxDuration).toBe(60);
      expect(result.temperature).toBe(0.7);
    });
  });

  describe('getGenerationParams (deprecated passthrough)', () => {
    test('should return generation params via classifyProviderOptions', () => {
      const result = ModelFactory.getGenerationParams({
        temperature: 0.7,
        anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
        baseURL: 'https://example.com',
      });
      expect(result).toEqual({ temperature: 0.7 });
      expect(result).not.toHaveProperty('anthropic');
      expect(result).not.toHaveProperty('baseURL');
    });
  });
});
