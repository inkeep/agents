import { type Span, trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPAN_KEYS } from '../../constants/otel-attributes';

vi.mock('../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../model-factory', () => ({
  ModelFactory: {
    parseModelString: vi.fn((modelId: string) => {
      if (!modelId.includes('/')) throw new Error(`No provider specified: ${modelId}`);
      const [provider, ...rest] = modelId.split('/');
      return { provider, modelName: rest.join('/') };
    }),
  },
}));

const mockSetAttribute = vi.fn();
const mockSpan: Partial<Span> = { setAttribute: mockSetAttribute };

vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    trace: {
      ...actual.trace,
      getActiveSpan: vi.fn(),
    },
  };
});

const mockGetModelPricing = vi.fn();
const mockCalculateCost = vi.fn();

vi.mock('../pricing-service', () => ({
  getPricingService: () => ({
    getModelPricing: mockGetModelPricing,
    calculateCost: mockCalculateCost,
  }),
}));

// Import after mocks
const { usageCostMiddleware } = await import('../usage-cost-middleware');

function makeV3Usage(input = 100, output = 50) {
  return {
    inputTokens: { total: input, cacheRead: 10, cacheWrite: 5 },
    outputTokens: { total: output, reasoning: 20 },
  };
}

function makeFlatUsage(input = 100, output = 50) {
  return { inputTokens: input, outputTokens: output };
}

describe('usageCostMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as Span);
    mockGetModelPricing.mockReturnValue({ inputPerToken: 0.000003, outputPerToken: 0.000015 });
    mockCalculateCost.mockReturnValue(0.001);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('wrapGenerate', () => {
    const callWrapGenerate = async (usage: any) => {
      const doGenerate = vi.fn().mockResolvedValue({ usage, text: 'response' });
      const model = { modelId: 'claude-sonnet-4', provider: 'anthropic.chat' };
      const result = await usageCostMiddleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params: {} as any,
        model: model as any,
      });
      return result;
    };

    it('extracts v3 structured usage and sets cost attribute', async () => {
      await callWrapGenerate(makeV3Usage(1000, 500));

      expect(mockGetModelPricing).toHaveBeenCalledWith('claude-sonnet-4', 'anthropic.chat');
      expect(mockCalculateCost).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 1000,
          outputTokens: 500,
          reasoningTokens: 20,
          cachedReadTokens: 10,
          cachedWriteTokens: 5,
        }),
        expect.any(Object)
      );
      expect(mockSetAttribute).toHaveBeenCalledWith(expect.any(String), 0.001);
    });

    it('handles flat usage format (v1/v2 shape)', async () => {
      await callWrapGenerate(makeFlatUsage(800, 200));

      expect(mockCalculateCost).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 800,
          outputTokens: 200,
          reasoningTokens: undefined,
          cachedReadTokens: undefined,
          cachedWriteTokens: undefined,
        }),
        expect.any(Object)
      );
    });

    it('sets pricing_unavailable attribute when no pricing found', async () => {
      mockGetModelPricing.mockReturnValue(null);

      await callWrapGenerate(makeV3Usage());

      expect(mockSetAttribute).toHaveBeenCalledWith(
        SPAN_KEYS.GEN_AI_COST_PRICING_UNAVAILABLE,
        true
      );
      expect(mockCalculateCost).not.toHaveBeenCalled();
    });

    it('does not throw when no active span', async () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

      const result = await callWrapGenerate(makeV3Usage());

      expect(result).toHaveProperty('text', 'response');
      expect(mockSetAttribute).not.toHaveBeenCalled();
    });

    it('returns result even when cost calculation fails', async () => {
      mockGetModelPricing.mockImplementation(() => {
        throw new Error('pricing error');
      });

      const result = await callWrapGenerate(makeV3Usage());

      expect(result).toHaveProperty('text', 'response');
    });

    it('passes through the doGenerate result unchanged', async () => {
      const result = await callWrapGenerate(makeV3Usage());

      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('text', 'response');
    });
  });

  describe('wrapStream', () => {
    const callWrapStream = async (usage: any) => {
      const finishChunk = { type: 'finish' as const, usage };
      const textChunk = { type: 'text-delta' as const, textDelta: 'hello' };
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(textChunk);
          controller.enqueue(finishChunk);
          controller.close();
        },
      });
      const doStream = vi.fn().mockResolvedValue({ stream, rawCall: {} });
      const model = { modelId: 'gpt-4o', provider: 'openai.chat' };
      const result = await usageCostMiddleware.wrapStream?.({
        doGenerate: vi.fn(),
        doStream,
        params: {} as any,
        model: model as any,
      });

      // Consume the stream to trigger the finish handler
      if (!result) throw new Error('wrapStream returned undefined');
      const reader = result.stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return chunks;
    };

    it('calculates cost on stream finish with v3 usage', async () => {
      await callWrapStream(makeV3Usage(2000, 800));

      expect(mockGetModelPricing).toHaveBeenCalledWith('gpt-4o', 'openai.chat');
      expect(mockCalculateCost).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 2000,
          outputTokens: 800,
        }),
        expect.any(Object)
      );
    });

    it('handles flat usage in stream finish chunk', async () => {
      await callWrapStream(makeFlatUsage(500, 100));

      expect(mockCalculateCost).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 500,
          outputTokens: 100,
        }),
        expect.any(Object)
      );
    });

    it('passes through all chunks including text deltas', async () => {
      const chunks = await callWrapStream(makeV3Usage());

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveProperty('type', 'text-delta');
      expect(chunks[1]).toHaveProperty('type', 'finish');
    });

    it('does not throw when no active span', async () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

      const finishChunk = { type: 'finish' as const, usage: makeV3Usage() };
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(finishChunk);
          controller.close();
        },
      });
      const doStream = vi.fn().mockResolvedValue({ stream, rawCall: {} });
      const model = { modelId: 'gpt-4o', provider: 'openai.chat' };
      const result = await usageCostMiddleware.wrapStream?.({
        doGenerate: vi.fn(),
        doStream,
        params: {} as any,
        model: model as any,
      });

      if (!result) throw new Error('wrapStream returned undefined');
      const reader = result.stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toHaveLength(1);
      expect(mockSetAttribute).not.toHaveBeenCalled();
    });
  });

  describe('model ID parsing', () => {
    it('uses providerId when available', async () => {
      const doGenerate = vi.fn().mockResolvedValue({ usage: makeV3Usage(), text: '' });
      const model = { modelId: 'claude-sonnet-4', provider: 'anthropic.chat' };
      await usageCostMiddleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params: {} as any,
        model: model as any,
      });

      expect(mockGetModelPricing).toHaveBeenCalledWith('claude-sonnet-4', 'anthropic.chat');
    });

    it('trims provider prefix from modelId when provider is set', async () => {
      const doGenerate = vi.fn().mockResolvedValue({ usage: makeV3Usage(), text: '' });
      const model = { modelId: 'anthropic/claude-sonnet-4', provider: 'anthropic.chat' };
      await usageCostMiddleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params: {} as any,
        model: model as any,
      });

      expect(mockGetModelPricing).toHaveBeenCalledWith('claude-sonnet-4', 'anthropic.chat');
    });

    it('falls back to parseModelString when provider is undefined', async () => {
      const doGenerate = vi.fn().mockResolvedValue({ usage: makeV3Usage(), text: '' });
      const model = { modelId: 'anthropic/claude-sonnet-4', provider: undefined };
      await usageCostMiddleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params: {} as any,
        model: model as any,
      });

      expect(mockGetModelPricing).toHaveBeenCalledWith('claude-sonnet-4', 'anthropic');
    });
  });
});
