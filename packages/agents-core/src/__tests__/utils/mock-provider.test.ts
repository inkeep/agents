import { describe, expect, it } from 'vitest';
import { createMockModel, MockLanguageModel } from '../../utils/mock-provider';
import { ModelFactory } from '../../utils/model-factory';

describe('Mock AI Provider', () => {
  describe('MockLanguageModel', () => {
    it('should implement LanguageModelV2 interface correctly', () => {
      const model = createMockModel('default');

      expect(model).toBeInstanceOf(MockLanguageModel);
      expect(model.specificationVersion).toBe('v2');
      expect(model.provider).toBe('mock');
      expect(model.modelId).toBe('default');
      expect(model.supportsImageUrls).toBe(false);
      expect(model.defaultObjectGenerationMode).toBeUndefined();
    });

    it('should accept any model name under mock/ prefix (T8)', () => {
      const models = ['default', 'fast', 'verbose', 'anything', 'test-model-123'];

      for (const name of models) {
        const model = createMockModel(name);
        expect(model.modelId).toBe(name);
        expect(model.provider).toBe('mock');
      }
    });
  });

  describe('doGenerate (non-streaming) (T4)', () => {
    it('should return structured mock response', async () => {
      const model = createMockModel('default');

      const result = await model.doGenerate({
        prompt: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello, mock!' }],
          },
        ],
      });

      expect(result.finishReason).toBe('stop');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(text).toContain('Mock response.');
      expect(text).toContain('Model: mock/default');
      expect(text).toContain('Input messages: 2');
      expect(text).toContain('Last user message: "Hello, mock!"');
      expect(text).toContain('Timestamp:');
    });

    it('should include message count in response (T1)', async () => {
      const model = createMockModel('default');

      const result = await model.doGenerate({
        prompt: [
          { role: 'system', content: 'System prompt.' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'First message' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Second message' }],
          },
        ],
      });

      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(text).toContain('Input messages: 4');
      expect(text).toContain('Last user message: "Second message"');
    });

    it('should return synthetic token usage', async () => {
      const model = createMockModel('default');

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Test' }],
          },
        ],
      });

      expect(result.usage).toBeDefined();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBe(result.usage.inputTokens + result.usage.outputTokens);
    });

    it('should truncate long user messages to 200 chars', async () => {
      const model = createMockModel('default');
      const longMessage = 'A'.repeat(300);

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: longMessage }],
          },
        ],
      });

      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(text).toContain(`${'A'.repeat(200)}...`);
      expect(text).not.toContain('A'.repeat(201));
    });

    it('should handle no user message gracefully', async () => {
      const model = createMockModel('default');

      const result = await model.doGenerate({
        prompt: [{ role: 'system', content: 'System only.' }],
      });

      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(text).toContain('(no user message)');
    });

    it('should include model name in response for custom mock models', async () => {
      const model = createMockModel('fast-test');

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
        ],
      });

      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(text).toContain('Model: mock/fast-test');
    });
  });

  describe('doStream (streaming) (T1)', () => {
    it('should stream response in multiple chunks', async () => {
      const model = createMockModel('default');

      const { stream, warnings } = await model.doStream({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello, mock!' }],
          },
        ],
      });

      expect(warnings).toEqual([]);

      const parts: any[] = [];
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }

      expect(parts.length).toBeGreaterThan(3);

      expect(parts[0].type).toBe('stream-start');
      expect(parts[1].type).toBe('text-start');
      expect(parts[1].id).toBe('mock-text-0');

      const textDeltas = parts.filter((p) => p.type === 'text-delta');
      expect(textDeltas.length).toBeGreaterThan(0);

      const fullText = textDeltas.map((p: any) => p.delta).join('');
      expect(fullText).toContain('Mock response.');
      expect(fullText).toContain('Model: mock/default');
      expect(fullText).toContain('Hello, mock!');

      const textEnd = parts.find((p) => p.type === 'text-end');
      expect(textEnd).toBeDefined();
      expect(textEnd.id).toBe('mock-text-0');

      const finish = parts.find((p) => p.type === 'finish');
      expect(finish).toBeDefined();
      expect(finish.finishReason).toBe('stop');
      expect(finish.usage.inputTokens).toBeGreaterThan(0);
      expect(finish.usage.outputTokens).toBeGreaterThan(0);
    });

    it('should stream line by line with delays', async () => {
      const model = createMockModel('default');

      const { stream } = await model.doStream({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
        ],
      });

      const parts: any[] = [];
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
      }

      const textDeltas = parts.filter((p) => p.type === 'text-delta');

      // Mock response has 5 lines, so should have 5 text deltas
      expect(textDeltas.length).toBe(5);

      // First 4 deltas should end with \n (line separator)
      for (let i = 0; i < 4; i++) {
        expect(textDeltas[i].delta).toMatch(/\n$/);
      }

      // Last delta should NOT end with \n
      expect(textDeltas[4].delta).not.toMatch(/\n$/);
    });

    it('should report higher message count for follow-up messages (T2)', async () => {
      const model = createMockModel('default');

      const result1 = await model.doGenerate({
        prompt: [
          { role: 'system', content: 'You are helpful.' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'First message' }],
          },
        ],
      });

      const text1 = result1.content[0].type === 'text' ? result1.content[0].text : '';
      expect(text1).toContain('Input messages: 2');

      const result2 = await model.doGenerate({
        prompt: [
          { role: 'system', content: 'You are helpful.' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'First message' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: text1 }],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Follow-up message' }],
          },
        ],
      });

      const text2 = result2.content[0].type === 'text' ? result2.content[0].text : '';
      expect(text2).toContain('Input messages: 4');
      expect(text2).toContain('Last user message: "Follow-up message"');
    });
  });

  describe('ModelFactory integration (T8)', () => {
    it('should parse mock/default model string', () => {
      const { provider, modelName } = ModelFactory.parseModelString('mock/default');
      expect(provider).toBe('mock');
      expect(modelName).toBe('default');
    });

    it('should parse mock/anything model string', () => {
      const { provider, modelName } = ModelFactory.parseModelString('mock/my-custom-model');
      expect(provider).toBe('mock');
      expect(modelName).toBe('my-custom-model');
    });

    it('should include mock in BUILT_IN_PROVIDERS', () => {
      expect(() => ModelFactory.parseModelString('mock/test')).not.toThrow();
    });

    it('should create a working mock model via createModel', async () => {
      const model = ModelFactory.createModel({ model: 'mock/default' });

      expect(model).toBeDefined();

      const result = await (model as any).doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'ModelFactory test' }],
          },
        ],
      });

      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(text).toContain('Mock response.');
      expect(text).toContain('Model: mock/default');
    });

    it('should create mock model without requiring any API keys', () => {
      const model = ModelFactory.createModel({ model: 'mock/default' });
      expect(model).toBeDefined();
    });

    it('should create mock model even when providerOptions are present', () => {
      const model = ModelFactory.createModel({
        model: 'mock/default',
        providerOptions: { baseURL: 'https://example.com' },
      });
      expect(model).toBeDefined();
    });

    it('should reject unsupported providers', () => {
      expect(() => ModelFactory.parseModelString('unsupported/model')).toThrow(
        /Unsupported provider/
      );
    });

    it('should validate model config via validateConfig', () => {
      const errors = ModelFactory.validateConfig({ model: 'mock/default' });
      expect(errors).toEqual([]);
    });
  });
});
