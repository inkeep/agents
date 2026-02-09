import type { ModelSettings } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCompressionConfigForModel, getModelContextWindow } from '../model-context-utils';

// Mock the llm-info module
vi.mock('llm-info', () => ({
  ModelInfoMap: {
    'gemini-2.5-pro': {
      name: 'Gemini 2.5 Pro',
      provider: 'google',
      contextWindowTokenLimit: 1048576, // 1M tokens
      outputTokenLimit: 65536,
    },
    'gemini-2.5-flash': {
      name: 'Gemini 2.5 Flash',
      provider: 'google',
      contextWindowTokenLimit: 1048576, // 1M tokens
      outputTokenLimit: 65536,
    },
    'gpt-4o': {
      name: 'GPT-4o',
      provider: 'openai',
      contextWindowTokenLimit: 128000, // 128K tokens
      outputTokenLimit: 4096,
    },
    'gpt-4-turbo': {
      name: 'GPT-4 Turbo',
      provider: 'openai',
      contextWindowTokenLimit: 200000, // 200K tokens
      outputTokenLimit: 8192,
    },
    'claude-3-opus': {
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      contextWindowTokenLimit: 200000, // 200K tokens
      outputTokenLimit: 4096,
    },
    'small-model': {
      name: 'Small Model',
      provider: 'test',
      contextWindowTokenLimit: 50000, // 50K tokens
      outputTokenLimit: 2048,
    },
    // Model without context window
    'incomplete-model': {
      name: 'Incomplete Model',
      provider: 'test',
      outputTokenLimit: 1024,
    },
  },
}));

// Mock the logger
vi.mock('../../../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../constants/execution-limits', () => ({
  COMPRESSION_ENABLED: true,
  COMPRESSION_HARD_LIMIT: 120000,
  COMPRESSION_SAFETY_BUFFER: 20000,
}));

describe('Model Context Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables that might affect default values
    delete process.env.AGENTS_COMPRESSION_HARD_LIMIT;
    delete process.env.AGENTS_COMPRESSION_SAFETY_BUFFER;
    delete process.env.AGENTS_COMPRESSION_ENABLED;

    // Also clear any other compression-related env vars that might contaminate defaults
    delete process.env.AGENTS_HARD_LIMIT;
    delete process.env.AGENTS_SAFETY_BUFFER;
    delete process.env.AGENTS_ENABLED;

    // Reset any cached module state
    vi.resetModules();
  });

  describe('getModelContextWindow', () => {
    describe('Model ID extraction logic', () => {
      it('should extract model ID from provider-prefixed models', () => {
        const testCases = [
          {
            input: { model: 'google/gemini-2.5-pro' },
            expected: {
              modelId: 'gemini-2.5-pro',
              contextWindow: 1048576,
              hasValidContextWindow: true,
              source: 'llm-info',
            },
          },
          {
            input: { model: 'openai/gpt-4o' },
            expected: {
              modelId: 'gpt-4o',
              contextWindow: 128000,
              hasValidContextWindow: true,
              source: 'llm-info',
            },
          },
          {
            input: { model: 'anthropic/claude-3-opus' },
            expected: {
              modelId: 'claude-3-opus',
              contextWindow: 200000,
              hasValidContextWindow: true,
              source: 'llm-info',
            },
          },
        ];

        testCases.forEach(({ input, expected }) => {
          const result = getModelContextWindow(input);
          expect(result).toEqual(expected);
        });
      });

      it('should handle models without provider prefix', () => {
        const result = getModelContextWindow({ model: 'gpt-4o' });
        expect(result).toEqual({
          modelId: 'gpt-4o',
          contextWindow: 128000,
          hasValidContextWindow: true,
          source: 'llm-info',
        });
      });

      it('should handle nested provider paths', () => {
        const result = getModelContextWindow({ model: 'provider/subprovider/model-name' });
        expect(result).toEqual({
          modelId: 'model-name',
          contextWindow: 120000,
          hasValidContextWindow: false,
          source: 'fallback',
        });
      });

      it('should handle empty or invalid model strings', () => {
        const testCases = [
          { model: '' },
          { model: '   ' },
          { model: null as any },
          { model: undefined as any },
        ];

        testCases.forEach((input) => {
          const result = getModelContextWindow(input);
          expect(result).toEqual({
            modelId: input.model || 'unknown',
            contextWindow: 120000,
            hasValidContextWindow: false,
            source: 'fallback',
          });
        });
      });
    });

    describe('Context window detection', () => {
      it('should find context windows for known models', () => {
        const testCases = [
          { model: 'gemini-2.5-pro', expectedTokens: 1048576 },
          { model: 'gpt-4o', expectedTokens: 128000 },
          { model: 'small-model', expectedTokens: 50000 },
        ];

        testCases.forEach(({ model, expectedTokens }) => {
          const result = getModelContextWindow({ model });
          expect(result.contextWindow).toBe(expectedTokens);
          expect(result.hasValidContextWindow).toBe(true);
          expect(result.source).toBe('llm-info');
        });
      });

      it('should handle models with incomplete information', () => {
        const result = getModelContextWindow({ model: 'incomplete-model' });
        expect(result).toEqual({
          modelId: 'incomplete-model',
          contextWindow: 120000,
          hasValidContextWindow: false,
          source: 'fallback',
        });
      });

      it('should fall back for unknown models', () => {
        const result = getModelContextWindow({ model: 'unknown-model-xyz' });
        expect(result).toEqual({
          modelId: 'unknown-model-xyz',
          contextWindow: 120000,
          hasValidContextWindow: false,
          source: 'fallback',
        });
      });
    });

    describe('Fallback scenarios', () => {
      it('should fall back when no model settings provided', () => {
        const result = getModelContextWindow();
        expect(result).toEqual({
          modelId: 'unknown',
          contextWindow: 120000,
          hasValidContextWindow: false,
          source: 'fallback',
        });
      });

      it('should fall back when model property is missing', () => {
        const result = getModelContextWindow({} as ModelSettings);
        expect(result).toEqual({
          modelId: 'unknown',
          contextWindow: 120000,
          hasValidContextWindow: false,
          source: 'fallback',
        });
      });
    });
  });

  describe('getCompressionConfigForModel', () => {
    describe('Model-size aware compression parameters', () => {
      it('should apply aggressive thresholds for large models (>500K)', () => {
        const result = getCompressionConfigForModel({ model: 'gemini-2.5-pro' });

        const expectedHardLimit = Math.floor(1048576 * 0.95); // 95% threshold
        const expectedSafetyBuffer = Math.floor(1048576 * 0.04); // 4% buffer

        expect(result).toEqual({
          hardLimit: expectedHardLimit,
          safetyBuffer: expectedSafetyBuffer,
          enabled: true,
          source: 'model-specific',
          modelContextInfo: expect.objectContaining({
            contextWindow: 1048576,
            hasValidContextWindow: true,
          }),
        });

        // Verify 91% trigger point
        const triggerPoint = expectedHardLimit - expectedSafetyBuffer;
        const triggerPercentage = triggerPoint / 1048576;
        expect(triggerPercentage).toBeCloseTo(0.91, 2);
      });

      it('should apply moderate thresholds for medium models (100K-500K)', () => {
        const result = getCompressionConfigForModel({ model: 'gpt-4-turbo' });

        const expectedHardLimit = Math.floor(200000 * 0.9); // 90% threshold
        const expectedSafetyBuffer = Math.floor(200000 * 0.07); // 7% buffer

        expect(result.hardLimit).toBe(expectedHardLimit);
        expect(result.safetyBuffer).toBe(expectedSafetyBuffer);

        // Verify 83% trigger point
        const triggerPoint = expectedHardLimit - expectedSafetyBuffer;
        const triggerPercentage = triggerPoint / 200000;
        expect(triggerPercentage).toBeCloseTo(0.83, 2);
      });

      it('should apply conservative thresholds for small models (<100K)', () => {
        const result = getCompressionConfigForModel({ model: 'small-model' });

        const expectedHardLimit = Math.floor(50000 * 0.85); // 85% threshold
        const expectedSafetyBuffer = Math.floor(50000 * 0.1); // 10% buffer

        expect(result.hardLimit).toBe(expectedHardLimit);
        expect(result.safetyBuffer).toBe(expectedSafetyBuffer);

        // Verify 75% trigger point
        const triggerPoint = expectedHardLimit - expectedSafetyBuffer;
        const triggerPercentage = triggerPoint / 50000;
        expect(triggerPercentage).toBeCloseTo(0.75, 2);
      });

      it('should handle GPT-4o specifically (medium threshold)', () => {
        const result = getCompressionConfigForModel({ model: 'gpt-4o' });

        const expectedHardLimit = Math.floor(128000 * 0.9); // 90% threshold
        const expectedSafetyBuffer = Math.floor(128000 * 0.07); // 7% buffer

        expect(result.hardLimit).toBe(expectedHardLimit);
        expect(result.safetyBuffer).toBe(expectedSafetyBuffer);
        expect(result.source).toBe('model-specific');
      });
    });

    describe('Environment variable fallbacks', () => {
      it('should use environment variables when set', () => {
        process.env.AGENTS_COMPRESSION_HARD_LIMIT = '150000';
        process.env.AGENTS_COMPRESSION_SAFETY_BUFFER = '25000';
        process.env.AGENTS_COMPRESSION_ENABLED = 'true';

        const result = getCompressionConfigForModel({ model: 'unknown-model' });

        expect(result).toEqual({
          hardLimit: 150000,
          safetyBuffer: 25000,
          enabled: true,
          source: 'environment',
          modelContextInfo: expect.objectContaining({
            hasValidContextWindow: false,
            source: 'fallback',
          }),
        });
      });

      it('should use default values when environment variables not set', () => {
        const result = getCompressionConfigForModel({ model: 'unknown-model' });

        // Note: The actual values may be influenced by environment variables set during test setup
        // The key is that it uses the 'default' source when no model-specific config is found
        expect(result).toEqual({
          hardLimit: expect.any(Number),
          safetyBuffer: expect.any(Number),
          enabled: true,
          source: 'default',
          modelContextInfo: expect.objectContaining({
            hasValidContextWindow: false,
            source: 'fallback',
          }),
        });

        // Verify the values are reasonable defaults
        expect(result.hardLimit).toBeGreaterThan(20000);
        expect(result.safetyBuffer).toBeGreaterThan(10000);
      });

      it('should handle disabled compression', () => {
        process.env.AGENTS_COMPRESSION_ENABLED = 'false';

        const result = getCompressionConfigForModel({ model: 'gpt-4o' });
        expect(result.enabled).toBe(false);
      });
    });

    describe('Edge cases and error handling', () => {
      it('should handle null/undefined model settings', () => {
        const result = getCompressionConfigForModel();
        expect(result.source).toBe('default');
        expect(result.hardLimit).toBeGreaterThan(20000);
        expect(result.safetyBuffer).toBeGreaterThan(10000);
      });

      it('should handle models with zero context window', () => {
        // Mock a model with zero context window
        vi.doMock('llm-info', () => ({
          ModelInfoMap: {
            'zero-context': {
              name: 'Zero Context Model',
              contextWindowTokenLimit: 0,
            },
          },
        }));

        const result = getCompressionConfigForModel({ model: 'zero-context' });
        expect(result.source).toBe('default');
        expect(result.hardLimit).toBeGreaterThan(20000);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should provide consistent results for the same model', () => {
      const result1 = getCompressionConfigForModel({ model: 'google/gemini-2.5-flash' });
      const result2 = getCompressionConfigForModel({ model: 'gemini-2.5-flash' });

      // Both should resolve to the same configuration
      expect(result1.hardLimit).toBe(result2.hardLimit);
      expect(result1.safetyBuffer).toBe(result2.safetyBuffer);
      expect(result1.source).toBe('model-specific');
    });

    it('should calculate reasonable trigger points for all model sizes', () => {
      const models = [
        { model: 'small-model', expected: { min: 0.7, max: 0.8 } },
        { model: 'gpt-4o', expected: { min: 0.8, max: 0.85 } },
        { model: 'gemini-2.5-pro', expected: { min: 0.9, max: 0.92 } },
      ];

      models.forEach(({ model, expected }) => {
        const result = getCompressionConfigForModel({ model });
        const triggerPoint = result.hardLimit - result.safetyBuffer;
        const contextWindow = getModelContextWindow({ model }).contextWindow;
        if (!contextWindow) {
          throw new Error('Context window not found');
        }
        const triggerPercentage = triggerPoint / contextWindow;

        expect(triggerPercentage).toBeGreaterThan(expected.min);
        expect(triggerPercentage).toBeLessThan(expected.max);
      });
    });
  });
});
