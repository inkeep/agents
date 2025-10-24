import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InkeepChatLanguageModel } from '../inkeep-chat-language-model';
import type { LanguageModelV2CallOptions } from '@ai-sdk/provider';

describe('InkeepChatLanguageModel', () => {
  const mockFetch = vi.fn();
  const mockConfig = {
    provider: 'inkeep',
    baseURL: 'http://localhost:3003',
    headers: () => ({}),
    fetch: mockFetch,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Model initialization', () => {
    it('should create model with correct properties', () => {
      const model = new InkeepChatLanguageModel('agent-123', {}, mockConfig);

      expect(model.modelId).toBe('agent-123');
      expect(model.provider).toBe('inkeep');
      expect(model.specificationVersion).toBe('v2');
      expect(model.defaultObjectGenerationMode).toBeUndefined();
      expect(model.supportsImageUrls).toBe(false);
    });

    it('should store options correctly', () => {
      const options = {
        conversationId: 'conv-123',
        headers: { 'user-id': 'user-456' },
      };

      const model = new InkeepChatLanguageModel('agent-123', options, mockConfig);

      expect(model.options.conversationId).toBe('conv-123');
      expect(model.options.headers).toEqual({ 'user-id': 'user-456' });
    });
  });

  describe('doGenerate', () => {
    it('should generate text response', async () => {
      const mockResponse = {
        id: 'response-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'agent-123',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello, world!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });

      const model = new InkeepChatLanguageModel('agent-123', {}, mockConfig);

      const options: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      const result = await model.doGenerate(options);

      expect(result.content).toEqual([{ type: 'text', text: 'Hello, world!' }]);
      expect(result.finishReason).toBe('stop');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(15);
    });

    it('should handle response without content', async () => {
      const mockResponse = {
        id: 'response-1',
        object: 'chat.completion',
        created: Date.now(),
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });

      const model = new InkeepChatLanguageModel('agent-123', {}, mockConfig);

      const options: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      const result = await model.doGenerate(options);

      expect(result.content).toEqual([]);
    });

    it('should include model options in request', async () => {
      const mockResponse = {
        id: 'response-1',
        object: 'chat.completion',
        created: Date.now(),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });

      const model = new InkeepChatLanguageModel(
        'agent-123',
        {
          conversationId: 'conv-456',
          headers: { 'user-id': 'user-789' },
        },
        mockConfig
      );

      const options: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      await model.doGenerate(options);

      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.conversationId).toBe('conv-456');
      expect(requestBody.headers).toEqual({ 'user-id': 'user-789' });
      expect(requestBody.stream).toBe(false);
    });
  });

  describe('Message conversion', () => {
    it('should convert user messages correctly', async () => {
      const mockResponse = {
        id: 'response-1',
        object: 'chat.completion',
        created: Date.now(),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });

      const model = new InkeepChatLanguageModel('agent-123', {}, mockConfig);

      const options: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      await model.doGenerate(options);

      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages).toBeDefined();
      expect(Array.isArray(requestBody.messages)).toBe(true);
    });
  });
});
