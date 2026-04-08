import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { type Span, trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPAN_KEYS } from '../../constants/otel-attributes';

vi.mock('../logger', () => createMockLoggerModule().module);

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

const { gatewayCostMiddleware, extractUsageTokens, normalizeModelId } = await import(
  '../usage-cost-middleware'
);

describe('gatewayCostMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('wrapGenerate', () => {
    const callWrapGenerate = async (providerMetadata?: Record<string, any>) => {
      const doGenerate = vi.fn().mockResolvedValue({
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'response',
        providerMetadata,
      });
      const model = { modelId: 'anthropic/claude-sonnet-4', provider: 'gateway' };
      return gatewayCostMiddleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params: {} as any,
        model: model as any,
      });
    };

    it('extracts cost from providerMetadata.gateway.cost', async () => {
      await callWrapGenerate({
        gateway: { cost: '0.0045405', marketCost: '0.0045405', generationId: 'gen_123' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0.0045405);
    });

    it('falls back to marketCost when cost is "0"', async () => {
      await callWrapGenerate({
        gateway: { cost: '0', marketCost: '0.004', generationId: 'gen_123' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0.004);
    });

    it('falls back to marketCost when cost is absent', async () => {
      await callWrapGenerate({
        gateway: { marketCost: '0.003', generationId: 'gen_123' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0.003);
    });

    it('sets cost to 0 when no providerMetadata.gateway exists', async () => {
      await callWrapGenerate(undefined);

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0);
    });

    it('sets cost to 0 when gateway metadata has no cost fields', async () => {
      await callWrapGenerate({
        gateway: { generationId: 'gen_123' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0);
    });

    it('handles BYOK scenario: cost=0 with marketCost available', async () => {
      await callWrapGenerate({
        gateway: { cost: '0', marketCost: '0.004', generationId: 'gen_byok' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0.004);
    });

    it('handles non-numeric cost strings gracefully', async () => {
      await callWrapGenerate({
        gateway: { cost: 'not-a-number', marketCost: 'also-bad' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0);
    });

    it('does not set pricing_unavailable attribute', async () => {
      await callWrapGenerate(undefined);

      const allCalls = mockSetAttribute.mock.calls.map((call: any[]) => call[0] as string);
      expect(allCalls).not.toContain('gen_ai.cost.pricing_unavailable');
    });

    it('does not throw when no active span', async () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

      const result = await callWrapGenerate({
        gateway: { cost: '0.001' },
      });

      expect(result).toHaveProperty('text', 'response');
      expect(mockSetAttribute).not.toHaveBeenCalled();
    });

    it('returns result unchanged even when cost extraction fails', async () => {
      const doGenerate = vi.fn().mockResolvedValue({
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'response',
        get providerMetadata() {
          throw new Error('metadata error');
        },
      });
      const model = { modelId: 'test', provider: 'gateway' };
      const result = await gatewayCostMiddleware.wrapGenerate?.({
        doGenerate,
        doStream: vi.fn(),
        params: {} as any,
        model: model as any,
      });

      expect(result).toHaveProperty('text', 'response');
    });
  });

  describe('wrapStream', () => {
    const callWrapStream = async (providerMetadata?: Record<string, any>) => {
      const finishChunk = {
        type: 'finish' as const,
        usage: { inputTokens: 100, outputTokens: 50 },
        providerMetadata,
      };
      const textChunk = { type: 'text-delta' as const, textDelta: 'hello' };
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(textChunk);
          controller.enqueue(finishChunk);
          controller.close();
        },
      });
      const doStream = vi.fn().mockResolvedValue({ stream, rawCall: {} });
      const model = { modelId: 'openai/gpt-4.1', provider: 'gateway' };
      const result = await gatewayCostMiddleware.wrapStream?.({
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
      return chunks;
    };

    it('extracts cost from finish chunk providerMetadata.gateway.cost', async () => {
      await callWrapStream({
        gateway: { cost: '0.003', marketCost: '0.003', generationId: 'gen_stream' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0.003);
    });

    it('falls back to marketCost in streaming', async () => {
      await callWrapStream({
        gateway: { cost: '0', marketCost: '0.005' },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0.005);
    });

    it('sets cost to 0 when no gateway metadata in stream', async () => {
      await callWrapStream(undefined);

      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0);
    });

    it('passes through all chunks including text deltas', async () => {
      const chunks = await callWrapStream({
        gateway: { cost: '0.001' },
      });

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveProperty('type', 'text-delta');
      expect(chunks[1]).toHaveProperty('type', 'finish');
    });

    it('does not throw when no active span', async () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

      const finishChunk = {
        type: 'finish' as const,
        usage: { inputTokens: 100, outputTokens: 50 },
        providerMetadata: { gateway: { cost: '0.001' } },
      };
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(finishChunk);
          controller.close();
        },
      });
      const doStream = vi.fn().mockResolvedValue({ stream, rawCall: {} });
      const model = { modelId: 'test', provider: 'gateway' };
      const result = await gatewayCostMiddleware.wrapStream?.({
        doGenerate: vi.fn(),
        doStream,
        params: {} as any,
        model: model as any,
      });

      if (!result) throw new Error('wrapStream returned undefined');
      const reader = result.stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(mockSetAttribute).not.toHaveBeenCalled();
    });
  });
});

describe('normalizeModelId', () => {
  it('strips known provider prefix from model ID', () => {
    expect(normalizeModelId('openai/gpt-5.4')).toBe('gpt-5.4');
    expect(normalizeModelId('anthropic/claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(normalizeModelId('google/gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });

  it('returns model ID unchanged when no provider prefix', () => {
    expect(normalizeModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(normalizeModelId('gpt-5.4')).toBe('gpt-5.4');
  });

  it('preserves non-gateway-routable provider prefixes', () => {
    expect(normalizeModelId('custom/my-model')).toBe('custom/my-model');
    expect(normalizeModelId('nim/nvidia/llama-3.3')).toBe('nim/nvidia/llama-3.3');
    expect(normalizeModelId('openrouter/anthropic/claude-sonnet-4')).toBe(
      'openrouter/anthropic/claude-sonnet-4'
    );
  });
});

describe('overrideModelId', () => {
  it('normalizes gateway model IDs with provider prefix', () => {
    const model = { modelId: 'openai/gpt-5.4', provider: 'gateway' };
    const result = gatewayCostMiddleware.overrideModelId?.({ model: model as any });
    expect(result).toBe('gpt-5.4');
  });

  it('passes through model IDs without provider prefix', () => {
    const model = { modelId: 'claude-sonnet-4-6', provider: 'anthropic.messages' };
    const result = gatewayCostMiddleware.overrideModelId?.({ model: model as any });
    expect(result).toBe('claude-sonnet-4-6');
  });
});

describe('extractUsageTokens', () => {
  it('extracts v3 structured usage', () => {
    const result = extractUsageTokens({
      inputTokens: { total: 1000, cacheRead: 10, cacheWrite: 5 },
      outputTokens: { total: 500, reasoning: 20 },
    });

    expect(result).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      reasoningTokens: 20,
      cachedReadTokens: 10,
      cachedWriteTokens: 5,
    });
  });

  it('extracts flat usage format', () => {
    const result = extractUsageTokens({
      inputTokens: 800,
      outputTokens: 200,
    });

    expect(result).toEqual({
      inputTokens: 800,
      outputTokens: 200,
      reasoningTokens: undefined,
      cachedReadTokens: undefined,
      cachedWriteTokens: undefined,
    });
  });

  it('handles undefined usage', () => {
    const result = extractUsageTokens(undefined);

    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: undefined,
      cachedReadTokens: undefined,
      cachedWriteTokens: undefined,
    });
  });
});
