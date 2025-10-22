import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectAvailableProvider,
  getDefaultModelForProvider,
  getModelConfigWithReasoning,
} from '../pull.llm-generate';

// Mock the env module
vi.mock('../../env', () => ({
  env: {
    ANTHROPIC_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    GOOGLE_API_KEY: undefined,
  },
}));

describe('Multi-Provider Support', () => {
  beforeEach(async () => {
    // Reset env mocks before each test
    const { env } = vi.mocked(await import('../../env'));
    env.ANTHROPIC_API_KEY = undefined;
    env.OPENAI_API_KEY = undefined;
    env.GOOGLE_API_KEY = undefined;
  });

  describe('detectAvailableProvider', () => {
    it('should detect Anthropic when ANTHROPIC_API_KEY is set', async () => {
      const { env } = vi.mocked(await import('../../env'));
      env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const provider = detectAvailableProvider();
      expect(provider).toBe('anthropic');
    });

    it('should detect OpenAI when OPENAI_API_KEY is set', async () => {
      const { env } = vi.mocked(await import('../../env'));
      env.OPENAI_API_KEY = 'test-openai-key';

      const provider = detectAvailableProvider();
      expect(provider).toBe('openai');
    });

    it('should detect Google when GOOGLE_API_KEY is set', async () => {
      const { env } = vi.mocked(await import('../../env'));
      env.GOOGLE_API_KEY = 'test-google-key';

      const provider = detectAvailableProvider();
      expect(provider).toBe('google');
    });

    it('should prioritize Anthropic over OpenAI and Google', async () => {
      const { env } = vi.mocked(await import('../../env'));
      env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      env.OPENAI_API_KEY = 'test-openai-key';
      env.GOOGLE_API_KEY = 'test-google-key';

      const provider = detectAvailableProvider();
      expect(provider).toBe('anthropic');
    });

    it('should prioritize OpenAI over Google when Anthropic is not set', async () => {
      const { env } = vi.mocked(await import('../../env'));
      env.OPENAI_API_KEY = 'test-openai-key';
      env.GOOGLE_API_KEY = 'test-google-key';

      const provider = detectAvailableProvider();
      expect(provider).toBe('openai');
    });

    it('should throw error when no API keys are set', () => {
      expect(() => detectAvailableProvider()).toThrow(
        'No LLM provider API key found. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY'
      );
    });

    it('should handle whitespace-only API keys', async () => {
      const { env } = vi.mocked(await import('../../env'));
      env.ANTHROPIC_API_KEY = '   ';
      env.OPENAI_API_KEY = '';

      expect(() => detectAvailableProvider()).toThrow(
        'No LLM provider API key found'
      );
    });
  });

  describe('getDefaultModelForProvider', () => {
    it('should return Claude Sonnet 4.5 for Anthropic', () => {
      const model = getDefaultModelForProvider('anthropic');
      expect(model).toBe('anthropic/claude-sonnet-4-5');
    });

    it('should return GPT-4.1 for OpenAI', () => {
      const model = getDefaultModelForProvider('openai');
      expect(model).toBe('openai/gpt-4.1');
    });

    it('should return Gemini 2.5 Pro for Google', () => {
      const model = getDefaultModelForProvider('google');
      expect(model).toBe('google/gemini-2.5-pro');
    });

    it('should throw error for unknown provider', () => {
      expect(() => getDefaultModelForProvider('unknown' as any)).toThrow(
        'Unknown provider: unknown'
      );
    });
  });

  describe('getModelConfigWithReasoning', () => {
    it('should return thinking config for Anthropic', () => {
      const config = getModelConfigWithReasoning('anthropic');
      expect(config).toEqual({
        thinking: {
          type: 'enabled',
          budget: {},
        },
      });
    });

    it('should return thinkingConfig for Google', () => {
      const config = getModelConfigWithReasoning('google');
      expect(config).toEqual({
        thinkingConfig: {
          mode: 'thinking',
        },
      });
    });

    it('should return empty config for OpenAI', () => {
      const config = getModelConfigWithReasoning('openai');
      expect(config).toEqual({});
    });

    it('should return empty config for unknown provider', () => {
      const config = getModelConfigWithReasoning('unknown' as any);
      expect(config).toEqual({});
    });
  });
});
