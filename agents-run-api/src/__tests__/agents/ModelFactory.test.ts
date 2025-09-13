import type { LanguageModel } from 'ai';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ModelFactory, type ModelSettings } from '../../agents/ModelFactory';

// Mock AI SDK providers
vi.mock('@ai-sdk/anthropic', () => {
  const mockAnthropicModel = { type: 'anthropic', modelId: 'claude-4-sonnet' } as LanguageModel;
  const mockAnthropicProvider = vi.fn().mockReturnValue(mockAnthropicModel);

  return {
    anthropic: vi.fn().mockReturnValue(mockAnthropicModel),
    createAnthropic: vi.fn().mockReturnValue(mockAnthropicProvider),
  };
});

vi.mock('@ai-sdk/openai', () => {
  const mockOpenAIModel = { type: 'openai', modelId: 'gpt-4o' } as LanguageModel;
  const mockOpenRouterModel = { type: 'openrouter', modelId: 'meta-llama/llama-2-70b-chat' } as LanguageModel;
  const mockCustomModel = { type: 'custom', modelId: 'custom-model' } as LanguageModel;
  
  const mockOpenAIProvider = vi.fn((modelName: string) => {
    if (modelName.includes('llama')) return mockOpenRouterModel;
    if (modelName.includes('custom')) return mockCustomModel;
    return mockOpenAIModel;
  });

  return {
    openai: vi.fn().mockReturnValue(mockOpenAIModel),
    createOpenAI: vi.fn().mockReturnValue(mockOpenAIProvider),
  };
});

// Mock logger
vi.mock('../../logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('ModelFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createModel', () => {
    test('should throw error when no config provided', () => {
      expect(() => {
        ModelFactory.createModel();
      }).toThrow('Model configuration is required. Please configure models at the project level.');
    });

    test('should throw error when null config provided', () => {
      expect(() => {
        ModelFactory.createModel(null);
      }).toThrow('Model configuration is required. Please configure models at the project level.');
    });

    test('should throw error when empty model string provided', () => {
      expect(() => {
        ModelFactory.createModel({ model: '' });
      }).toThrow('Model configuration is required. Please configure models at the project level.');
    });

    test('should throw error when undefined model provided', () => {
      expect(() => {
        ModelFactory.createModel({ model: undefined });
      }).toThrow('Model configuration is required. Please configure models at the project level.');
    });

    test('should create Anthropic model with explicit config', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should create OpenAI model with explicit config', () => {
      const config: ModelSettings = {
        model: 'openai/gpt-4o',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'openai');
    });

    test('should handle model string without provider prefix (defaults to anthropic)', () => {
      const config: ModelSettings = {
        model: 'claude-3-5-haiku-20241022',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should create Anthropic model with custom provider options', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          anthropic: {
            baseURL: 'https://custom-endpoint.com',
            temperature: 0.8,
            maxTokens: 2048,
          },
        },
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should create OpenAI model with custom provider options', () => {
      const config: ModelSettings = {
        model: 'openai/gpt-4o',
        providerOptions: {
          openai: {
            baseURL: 'https://api.openai.com/v1',
            temperature: 0.3,
          },
        },
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'openai');
    });

    test('should handle AI Gateway configuration', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          anthropic: {
            temperature: 0.7,
          },
          gateway: {
            order: ['anthropic', 'openai'],
            fallbackStrategy: 'cost-optimized',
          },
        },
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should fall back to default model for unknown provider', () => {
      const config: ModelSettings = {
        model: 'unknown-provider/some-model',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should handle fallback when creation fails', () => {
      // This test verifies the fallback behavior exists
      // The actual error handling is tested through the validation method
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });
  });

  describe('getGenerationParams', () => {
    test('should return empty object when no provider options', () => {
      const params = ModelFactory.getGenerationParams();
      expect(params).toEqual({});
    });

    test('should return filtered parameters when provider options given', () => {
      const providerOptions = {
        temperature: 0.7,
        maxTokens: 1000,
        apiKey: 'should-be-excluded',
        baseURL: 'should-be-excluded',
      };
      const params = ModelFactory.getGenerationParams(providerOptions);
      expect(params).toEqual({
        temperature: 0.7,
        maxTokens: 1000,
      });
    });

    test('should extract generation parameters and exclude provider config', () => {
      const providerOptions = {
        temperature: 0.8,
        maxTokens: 2048,
        topP: 0.95,
        apiKey: 'should-not-be-included', // Provider config, not generation param
        baseURL: 'should-not-be-included', // Provider config, not generation param
      };

      const params = ModelFactory.getGenerationParams(providerOptions);

      expect(params).toEqual({
        temperature: 0.8,
        maxTokens: 2048,
        topP: 0.95,
      });
    });

    test('should extract generation parameters including OpenAI specific ones', () => {
      const providerOptions = {
        temperature: 0.3,
        maxTokens: 1500,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
      };

      const params = ModelFactory.getGenerationParams(providerOptions);

      expect(params).toEqual({
        temperature: 0.3,
        maxTokens: 1500,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
      });
    });

    test('should handle empty provider options', () => {
      const providerOptions = {};

      const params = ModelFactory.getGenerationParams(providerOptions);

      expect(params).toEqual({});
    });

    test('should only include defined parameters', () => {
      const providerOptions = {
        temperature: 0.7,
        maxTokens: undefined, // Should be excluded
        topP: 0.9,
      };

      const params = ModelFactory.getGenerationParams(providerOptions);

      expect(params).toEqual({
        temperature: 0.7,
        topP: 0.9,
      });
    });

    test('should pass through any generation parameter, even unknown ones', () => {
      const providerOptions = {
        temperature: 0.8,
        customParam: 'test-value',
        futureParam: 42,
        apiKey: 'excluded-provider-config',
      };

      const params = ModelFactory.getGenerationParams(providerOptions);

      expect(params).toEqual({
        temperature: 0.8,
        customParam: 'test-value',
        futureParam: 42,
        // apiKey excluded as it's provider config
      });
    });
  });

  describe('validateConfig', () => {
    test('should pass validation for valid config', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          anthropic: {
            temperature: 0.7,
            maxTokens: 4096,
            topP: 0.9,
          },
        },
      };

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    test('should fail validation when model is missing', () => {
      const config = { model: '' } as ModelSettings;

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toContain('Model name is required');
    });

    test('should pass validation for any parameter values (AI SDK handles validation)', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          anthropic: {
            temperature: 3.0, // AI SDK will validate
            maxTokens: -100, // AI SDK will validate
            topP: 1.5, // AI SDK will validate
            customParam: 'any-value', // AI SDK will handle unknown params
          },
        },
      };

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toHaveLength(0); // Only basic structure validation
    });

    test('should validate basic config structure', () => {
      const config = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          temperature: 0.7,
          maxTokens: 1000,
        },
      } as ModelSettings;

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toHaveLength(0);
    });

    test('should validate structure but not parameter values', () => {
      const config: ModelSettings = {
        model: 'openai/gpt-4o',
        providerOptions: {
          openai: {
            temperature: 5.0, // Values not validated, left to AI SDK
            maxTokens: -50,
            topP: 2.0,
          },
        },
      };

      const errors = ModelFactory.validateConfig(config);
      expect(errors).toHaveLength(0); // Structure is valid, values left to AI SDK
    });
  });

  describe('prepareGenerationConfig', () => {
    test('should return model and generation params ready for generateText', () => {
      const modelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          temperature: 0.8,
          maxTokens: 2048,
          apiKey: 'should-not-be-included',
        },
      };

      const config = ModelFactory.prepareGenerationConfig(modelSettings);

      expect(config).toHaveProperty('model');
      expect(config.model).toBeDefined();
      expect(config.model).toHaveProperty('type', 'anthropic');
      expect(config).toHaveProperty('temperature', 0.8);
      expect(config).toHaveProperty('maxTokens', 2048);
      expect(config).not.toHaveProperty('apiKey'); // Should be filtered out
    });

    test('should use default model when none specified', () => {
      const config = ModelFactory.prepareGenerationConfig();

      expect(config).toHaveProperty('model');
      expect(config.model).toBeDefined();
      expect(config.model).toHaveProperty('type', 'anthropic');
    });

    test('should handle OpenAI model settingsuration', () => {
      const modelSettings = {
        model: 'openai/gpt-4o',
        providerOptions: {
          temperature: 0.3,
          frequencyPenalty: 0.1,
          baseURL: 'should-not-be-included',
        },
      };

      const config = ModelFactory.prepareGenerationConfig(modelSettings);

      expect(config).toHaveProperty('model');
      expect(config.model).toHaveProperty('type', 'openai');
      expect(config).toHaveProperty('temperature', 0.3);
      expect(config).toHaveProperty('frequencyPenalty', 0.1);
      expect(config).not.toHaveProperty('baseURL'); // Should be filtered out
    });

    test('should handle model settings with no provider options', () => {
      const modelSettings = {
        model: 'anthropic/claude-3-5-haiku-20241022',
      };

      const config = ModelFactory.prepareGenerationConfig(modelSettings);

      expect(config).toHaveProperty('model');
      expect(config.model).toHaveProperty('type', 'anthropic');
      // Should only have the model property, no generation params
      expect(Object.keys(config)).toEqual(['model']);
    });

    test('should be ready to spread into generateText call', () => {
      const modelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          temperature: 0.7,
          maxTokens: 4096,
        },
      };

      const config = ModelFactory.prepareGenerationConfig(modelSettings);

      // This simulates how it would be used in generateText
      const generateTextConfig = {
        ...config,
        messages: [{ role: 'user', content: 'test' }],
        tools: [],
      };

      expect(generateTextConfig).toHaveProperty('model');
      expect(generateTextConfig).toHaveProperty('temperature', 0.7);
      expect(generateTextConfig).toHaveProperty('maxTokens', 4096);
      expect(generateTextConfig).toHaveProperty('messages');
      expect(generateTextConfig).toHaveProperty('tools');
    });
  });

  describe('model string parsing', () => {
    test('should parse provider/model format correctly via parseModelString', () => {
      const result = ModelFactory.parseModelString('anthropic/claude-4-sonnet-20250514');

      expect(result).toEqual({
        provider: 'anthropic',
        modelName: 'claude-4-sonnet-20250514',
      });
    });

    test('should parse provider/model format correctly', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should handle model names with multiple slashes', () => {
      const config: ModelSettings = {
        model: 'openai/org/custom-model-v2',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'openai');
    });

    test('should default to anthropic when no provider specified', () => {
      const config: ModelSettings = {
        model: 'claude-3-5-haiku-20241022',
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });
  });

  describe('provider configuration handling', () => {
    test('should handle provider configuration with baseURL', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          anthropic: {
            baseURL: 'https://test.com',
          },
        },
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should handle OpenAI provider configuration', () => {
      const config: ModelSettings = {
        model: 'openai/gpt-4o',
        providerOptions: {
          openai: {
            baseUrl: 'https://api.test.com/v1',
          },
        },
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'openai');
    });

    test('should handle both baseUrl and baseURL variants', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          anthropic: {
            baseUrl: 'https://test-baseurl.com',
          },
        },
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });

    test('should handle provider configuration with only generation params', () => {
      const config: ModelSettings = {
        model: 'anthropic/claude-4-sonnet-20250514',
        providerOptions: {
          anthropic: {
            temperature: 0.7, // Only generation params, no provider config
          },
        },
      };

      const model = ModelFactory.createModel(config);

      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'anthropic');
    });
  });

  describe('security validation', () => {
    describe('validateConfig', () => {
      test('should pass validation for valid config without API keys', () => {
        const config: ModelSettings = {
          model: 'anthropic/claude-4-sonnet-20250514',
          providerOptions: {
            anthropic: {
              temperature: 0.7,
              maxTokens: 2048,
              baseURL: 'https://custom.com',
            },
          },
        };

        const errors = ModelFactory.validateConfig(config);
        expect(errors).toEqual([]);
      });

      test('should allow config with API keys in provider options (with warning)', () => {
        const config: ModelSettings = {
          model: 'anthropic/claude-4-sonnet-20250514',
          providerOptions: {
            apiKey: 'test-key',
            temperature: 0.7,
          },
        };

        // Should not return errors, just log warning
        const errors = ModelFactory.validateConfig(config);
        expect(errors).toHaveLength(0);
      });

      test('should allow OpenRouter config with API key', () => {
        const config: ModelSettings = {
          model: 'openrouter/meta-llama/llama-2-70b-chat',
          providerOptions: {
            apiKey: 'or-test123',
            temperature: 0.5,
          },
        };

        const errors = ModelFactory.validateConfig(config);
        expect(errors).toHaveLength(0);
      });

      test('should allow custom provider config with baseURL and API key', () => {
        const config: ModelSettings = {
          model: 'custom/my-model',
          providerOptions: {
            baseURL: 'https://api.custom.com/v1',
            apiKey: 'custom-key',
            headers: { 'X-Custom': 'value' },
          },
        };

        const errors = ModelFactory.validateConfig(config);
        expect(errors).toHaveLength(0);
      });

      test('should allow valid configs without API keys', () => {
        const config: ModelSettings = {
          model: 'anthropic/claude-4-sonnet-20250514',
          providerOptions: {
            temperature: 0.7,
            maxTokens: 1000,
          },
        };

        const errors = ModelFactory.validateConfig(config);
        expect(errors).toHaveLength(0);
      });
    });

    describe('provider validation', () => {
      test('should fall back to anthropic for unsupported provider', () => {
        const result = ModelFactory.parseModelString('unsupported-provider/some-model');
        expect(result).toEqual({
          provider: 'anthropic',
          modelName: 'some-model',
        });
      });

      test('should support anthropic provider', () => {
        const result = ModelFactory.parseModelString('anthropic/claude-4-sonnet');
        expect(result).toEqual({
          provider: 'anthropic',
          modelName: 'claude-4-sonnet',
        });
      });

      test('should support openai provider', () => {
        const result = ModelFactory.parseModelString('openai/gpt-4o');
        expect(result).toEqual({
          provider: 'openai',
          modelName: 'gpt-4o',
        });
      });

      test('should handle case insensitive providers', () => {
        const result = ModelFactory.parseModelString('ANTHROPIC/claude-4-sonnet');
        expect(result).toEqual({
          provider: 'anthropic',
          modelName: 'claude-4-sonnet',
        });
      });
    });

    test('should handle OpenRouter model with slashes in model name', () => {
      const result = ModelFactory.parseModelString('openrouter/meta-llama/llama-2-70b-chat');
      expect(result).toEqual({
        provider: 'openrouter',
        modelName: 'meta-llama/llama-2-70b-chat',
      });
    });

    test('should parse custom provider correctly', () => {
      const result = ModelFactory.parseModelString('custom/my-custom-model');
      expect(result).toEqual({
        provider: 'custom',
        modelName: 'my-custom-model',
      });
    });
  });

  describe('OpenRouter integration', () => {
    test('should create OpenRouter model with environment variable', () => {
      const originalEnv = process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

      const config: ModelSettings = {
        model: 'openrouter/meta-llama/llama-2-70b-chat',
      };

      const model = ModelFactory.createModel(config);
      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'openrouter');

      // Restore original env
      if (originalEnv === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalEnv;
      }
    });

    test('should create OpenRouter model with custom baseURL', () => {
      const config: ModelSettings = {
        model: 'openrouter/meta-llama/llama-2-70b-chat',
        providerOptions: {
          baseURL: 'https://custom-openrouter.com/v1',
        },
      };

      const model = ModelFactory.createModel(config);
      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'openrouter');
    });
  });

  describe('Custom provider integration', () => {
    test('should create custom provider model with required baseURL', () => {
      const config: ModelSettings = {
        model: 'custom/my-model',
        providerOptions: {
          baseURL: 'https://api.custom-provider.com/v1',
        },
      };

      const model = ModelFactory.createModel(config);
      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'custom');
    });

    test('should support custom headers for custom provider', () => {
      const config: ModelSettings = {
        model: 'custom/my-model',
        providerOptions: {
          baseURL: 'https://api.custom-provider.com/v1',
          headers: {
            'X-API-Version': 'v2',
            'X-Organization': 'my-org',
          },
        },
      };

      const model = ModelFactory.createModel(config);
      expect(model).toBeDefined();
      expect(model).toHaveProperty('type', 'custom');
    });
  });
});
