import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { type Span, trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPAN_KEYS } from '../../constants/otel-attributes';
import { assertCacheSpanKeys } from './helpers/cache-contracts';

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

const {
  gatewayCostMiddleware,
  extractUsageTokens,
  normalizeModelId,
  computePrefixSignature,
  countCacheMarkers,
} = await import('../usage-cost-middleware');

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

    it('emits response/request provider from gateway routing (the cache-state attribution path)', async () => {
      // GEN_AI_RESPONSE_PROVIDER (from routing.finalProvider) is what the cache-state
      // classifier reads to avoid misclassifying gateway-routed HITs as NOT-SUPPORTED;
      // pin its emission so a gateway metadata-schema change can't silently break it.
      await callWrapGenerate({
        gateway: {
          cost: '0.001',
          routing: { finalProvider: 'anthropic', resolvedProvider: 'anthropic' },
        },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(
        SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER,
        'anthropic'
      );
      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_REQUEST_PROVIDER, 'anthropic');
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
    const callWrapStream = async (
      providerMetadata?: Record<string, any>,
      params: Record<string, any> = {},
      usage: Record<string, any> = { inputTokens: 100, outputTokens: 50 }
    ) => {
      const finishChunk = {
        type: 'finish' as const,
        usage,
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
        params: params as any,
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

    it('emits response/request provider from gateway routing on the stream finish chunk', async () => {
      await callWrapStream({
        gateway: {
          cost: '0.003',
          routing: { finalProvider: 'anthropic', resolvedProvider: 'anthropic' },
        },
      });

      expect(mockSetAttribute).toHaveBeenCalledWith(
        SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER,
        'anthropic'
      );
      expect(mockSetAttribute).toHaveBeenCalledWith(SPAN_KEYS.GEN_AI_REQUEST_PROVIDER, 'anthropic');
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

    it('emits cache telemetry span attributes on stream finish', async () => {
      await callWrapStream(
        { gateway: { cost: '0.003' } },
        {
          prompt: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'What is the weather?' },
          ],
          tools: [
            {
              name: 'get_weather',
              description: 'Fetch the weather',
              parameters: { type: 'object', properties: { city: { type: 'string' } } },
            },
          ],
          providerOptions: { gateway: { caching: 'auto' } },
        },
        { inputTokens: { total: 10000, cacheRead: 8000, cacheWrite: 2000 }, outputTokens: 500 }
      );

      assertCacheSpanKeys(mockSetAttribute.mock.calls, {
        cacheReadTokens: 8000,
        cacheCreationTokens: 2000,
        markerCount: 1,
      });

      const sig = mockSetAttribute.mock.calls.find(
        (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
      )?.[1];
      expect(typeof sig).toBe('string');
      expect((sig as string).length).toBe(10);
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

    it('emits no cost/cache attributes when the stream ends without a finish chunk (cancelled/partial)', async () => {
      // Client disconnect / cancellation / timeout closes the stream with no
      // 'finish' chunk, so the transform's finish-guard never fires and no cost or
      // cache telemetry is reported for the partial stream. The active span is
      // present (beforeEach), so this pins the "no finish = no attributes" contract
      // — the cancelled-generation path, which is the common production case.
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta' as const, textDelta: 'partial' });
          controller.close(); // no finish chunk
        },
      });
      const doStream = vi.fn().mockResolvedValue({ stream, rawCall: {} });
      const model = { modelId: 'openai/gpt-4.1', provider: 'gateway' };
      const result = await gatewayCostMiddleware.wrapStream?.({
        doGenerate: vi.fn(),
        doStream,
        params: { providerOptions: { gateway: { caching: 'auto' } } } as any,
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

  it('extracts Gemini cache tokens from inputTokenDetails.cacheReadTokens', () => {
    const result = extractUsageTokens({
      inputTokens: 5000,
      outputTokens: 200,
      inputTokenDetails: { cacheReadTokens: 3000 },
    });

    expect(result.cachedReadTokens).toBe(3000);
    expect(result.cachedWriteTokens).toBeUndefined();
  });

  it('extracts Gemini cache tokens from cachedInputTokens fallback', () => {
    const result = extractUsageTokens({
      inputTokens: 5000,
      outputTokens: 200,
      cachedInputTokens: 2500,
    });

    expect(result.cachedReadTokens).toBe(2500);
  });

  it('prefers Anthropic/OpenAI path over Gemini fallback', () => {
    const result = extractUsageTokens({
      inputTokens: { total: 5000, cacheRead: 1000, cacheWrite: 500 },
      outputTokens: 200,
      inputTokenDetails: { cacheReadTokens: 9999 },
    });

    expect(result.cachedReadTokens).toBe(1000);
    expect(result.cachedWriteTokens).toBe(500);
  });
});

describe('cache SPAN_KEYS emission via wrapGenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const callWithCache = async (
    usage: Record<string, any>,
    params?: Record<string, any>,
    providerMetadata?: Record<string, any>
  ) => {
    const doGenerate = vi.fn().mockResolvedValue({
      usage,
      text: 'response',
      providerMetadata,
    });
    const model = { modelId: 'anthropic/claude-sonnet-4', provider: 'gateway' };
    return gatewayCostMiddleware.wrapGenerate?.({
      doGenerate,
      doStream: vi.fn(),
      params: {
        prompt: [{ role: 'system', content: 'You are helpful.' }],
        ...params,
      } as any,
      model: model as any,
    });
  };

  it('emits Anthropic cache read + write tokens as span attributes', async () => {
    await callWithCache({
      inputTokens: { total: 10000, cacheRead: 8000, cacheWrite: 0 },
      outputTokens: 500,
    });

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 8000,
      cacheCreationTokens: 0,
      markerCount: 0,
    });
  });

  it('emits Anthropic cache creation tokens', async () => {
    await callWithCache({
      inputTokens: { total: 10000, cacheRead: 0, cacheWrite: 5000 },
      outputTokens: 500,
    });

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 5000,
      markerCount: 0,
    });
  });

  it('emits Gemini cache tokens from inputTokenDetails path', async () => {
    await callWithCache({
      inputTokens: 5000,
      outputTokens: 200,
      inputTokenDetails: { cacheReadTokens: 3000 },
    });

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 3000,
      cacheCreationTokens: 0,
      markerCount: 0,
    });
  });

  it('emits zero cache tokens when usage has no cache fields', async () => {
    await callWithCache({
      inputTokens: 1000,
      outputTokens: 200,
    });

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      markerCount: 0,
    });
  });

  it('counts gateway caching:auto as 1 marker', async () => {
    await callWithCache(
      { inputTokens: 1000, outputTokens: 200 },
      { providerOptions: { gateway: { caching: 'auto' } } }
    );

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      markerCount: 1,
    });
  });

  it('counts per-message anthropic.cacheControl markers', async () => {
    await callWithCache(
      { inputTokens: 1000, outputTokens: 200 },
      {
        prompt: [
          {
            role: 'system',
            content: 'System prompt',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
        ],
      }
    );

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      markerCount: 1,
    });
  });

  it('caps marker count at 4', async () => {
    await callWithCache(
      { inputTokens: 1000, outputTokens: 200 },
      {
        providerOptions: { gateway: { caching: 'auto' } },
        prompt: [
          {
            role: 'system',
            content: 'a',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
          {
            role: 'user',
            content: 'b',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
          {
            role: 'user',
            content: 'c',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
          {
            role: 'user',
            content: 'd',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
          {
            role: 'user',
            content: 'e',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
        ],
      }
    );

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      markerCount: 4,
    });
  });

  it('computes deterministic prefix signature from system message', async () => {
    await callWithCache(
      { inputTokens: 1000, outputTokens: 200 },
      { prompt: [{ role: 'system', content: 'You are a helpful assistant.' }] }
    );

    const sig1 = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    mockSetAttribute.mockClear();

    await callWithCache(
      { inputTokens: 1000, outputTokens: 200 },
      { prompt: [{ role: 'system', content: 'You are a helpful assistant.' }] }
    );

    const sig2 = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    expect(sig1).toBe(sig2);
    expect(typeof sig1).toBe('string');
    expect((sig1 as string).length).toBe(10);
  });

  it('produces different prefix signature when system message changes', async () => {
    await callWithCache(
      { inputTokens: 1000, outputTokens: 200 },
      { prompt: [{ role: 'system', content: 'System A' }] }
    );

    const sigA = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    mockSetAttribute.mockClear();

    await callWithCache(
      { inputTokens: 1000, outputTokens: 200 },
      { prompt: [{ role: 'system', content: 'System B' }] }
    );

    const sigB = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    expect(sigA).not.toBe(sigB);
  });

  it('degrades gracefully when usage is undefined', async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      usage: undefined,
      text: 'response',
    });
    await gatewayCostMiddleware.wrapGenerate?.({
      doGenerate,
      doStream: vi.fn(),
      params: { prompt: [{ role: 'system', content: 'test' }] } as any,
      model: { modelId: 'test', provider: 'test' } as any,
    });

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      markerCount: 0,
    });
  });

  it('degrades gracefully when usage has wrong-type cache fields', async () => {
    await callWithCache({
      inputTokens: { total: 1000, cacheRead: 'not-a-number', cacheWrite: null },
      outputTokens: 200,
    });

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      markerCount: 0,
    });
  });
});

describe('T-MULTITURN hermetic shapes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const systemPrompt = 'You are a Smart Assist agent. Current time: 2026-05-26 10:00.';
  const tools = [
    {
      name: 'search',
      description: 'Search the web',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
    },
  ];

  it('T-MULTITURN-1: cross-turn HIT — identical prefix, cacheRead > 0 on call 2', async () => {
    const sharedParams = {
      prompt: [{ role: 'system', content: systemPrompt }],
      tools,
      providerOptions: { gateway: { caching: 'auto' } },
    };

    await gatewayCostMiddleware.wrapGenerate?.({
      doGenerate: vi.fn().mockResolvedValue({
        usage: { inputTokens: { total: 10000, cacheRead: 0, cacheWrite: 8000 }, outputTokens: 500 },
        text: 'turn 1',
      }),
      doStream: vi.fn(),
      params: sharedParams as any,
      model: { modelId: 'anthropic/claude-sonnet-4', provider: 'gateway' } as any,
    });

    const call1Sig = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    mockSetAttribute.mockClear();

    await gatewayCostMiddleware.wrapGenerate?.({
      doGenerate: vi.fn().mockResolvedValue({
        usage: { inputTokens: { total: 10000, cacheRead: 8000, cacheWrite: 0 }, outputTokens: 500 },
        text: 'turn 2',
      }),
      doStream: vi.fn(),
      params: sharedParams as any,
      model: { modelId: 'anthropic/claude-sonnet-4', provider: 'gateway' } as any,
    });

    const call2Sig = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    expect(call1Sig).toBe(call2Sig);

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 8000,
      cacheCreationTokens: 0,
      markerCount: 1,
      prefixSignature: call2Sig as string,
    });
  });

  it('T-MULTITURN-2: cross-turn MISS-expected — different prefix, cacheRead = 0 on call 2', async () => {
    const call1Params = {
      prompt: [{ role: 'system', content: systemPrompt }],
      tools,
      providerOptions: { gateway: { caching: 'auto' } },
    };

    await gatewayCostMiddleware.wrapGenerate?.({
      doGenerate: vi.fn().mockResolvedValue({
        usage: { inputTokens: { total: 10000, cacheRead: 0, cacheWrite: 8000 }, outputTokens: 500 },
        text: 'turn 1',
      }),
      doStream: vi.fn(),
      params: call1Params as any,
      model: { modelId: 'anthropic/claude-sonnet-4', provider: 'gateway' } as any,
    });

    const call1Sig = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    mockSetAttribute.mockClear();

    const call2Params = {
      prompt: [{ role: 'system', content: `${systemPrompt} MUTATED: artifacts added.` }],
      tools,
      providerOptions: { gateway: { caching: 'auto' } },
    };

    await gatewayCostMiddleware.wrapGenerate?.({
      doGenerate: vi.fn().mockResolvedValue({
        usage: { inputTokens: { total: 10000, cacheRead: 0, cacheWrite: 8000 }, outputTokens: 500 },
        text: 'turn 2',
      }),
      doStream: vi.fn(),
      params: call2Params as any,
      model: { modelId: 'anthropic/claude-sonnet-4', provider: 'gateway' } as any,
    });

    const call2Sig = mockSetAttribute.mock.calls.find(
      (c: any[]) => c[0] === SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE
    )?.[1];

    expect(call1Sig).not.toBe(call2Sig);

    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: 0,
      cacheCreationTokens: 8000,
      markerCount: 1,
      prefixSignature: call2Sig as string,
    });
  });
});

describe('computePrefixSignature', () => {
  it('includes tool definitions in the hash', () => {
    const prompt = [{ role: 'system', content: 'test' }];
    const tools1 = [{ name: 'tool_a', description: 'desc a' }];
    const tools2 = [{ name: 'tool_b', description: 'desc b' }];

    const sig1 = computePrefixSignature(prompt, tools1);
    const sig2 = computePrefixSignature(prompt, tools2);

    expect(sig1).not.toBe(sig2);
    expect(sig1.length).toBe(10);
    expect(sig2.length).toBe(10);
  });

  it('handles system message with content array', () => {
    const prompt = [{ role: 'system', content: [{ text: 'Hello' }, { text: ' world' }] }];
    const sig = computePrefixSignature(prompt);

    expect(typeof sig).toBe('string');
    expect(sig.length).toBe(10);
  });

  it('ignores non-system messages', () => {
    const sig1 = computePrefixSignature([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user msg A' },
    ]);
    const sig2 = computePrefixSignature([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user msg B' },
    ]);

    expect(sig1).toBe(sig2);
  });

  it('produces a deterministic hash for empty prompt and no tools', () => {
    const sig1 = computePrefixSignature([]);
    const sig2 = computePrefixSignature([]);

    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(10);
    expect(computePrefixSignature([], [])).toBe(sig1);
  });

  it('produces a stable non-empty hash for a tools-only agent (no system message)', () => {
    const prompt = [{ role: 'user', content: 'do the thing' }];
    const tools = [
      {
        name: 'search',
        description: 'Search the web',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ];

    const sig1 = computePrefixSignature(prompt, tools);
    const sig2 = computePrefixSignature(prompt, tools);

    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(10);
    expect(sig1).not.toBe(computePrefixSignature(prompt));
  });

  it('changes the tools-only hash when a tool name changes', () => {
    const prompt = [{ role: 'user', content: 'do the thing' }];
    const base = [{ name: 'search', description: 'Search the web', parameters: { a: 1 } }];
    const renamed = [{ name: 'lookup', description: 'Search the web', parameters: { a: 1 } }];

    expect(computePrefixSignature(prompt, base)).not.toBe(computePrefixSignature(prompt, renamed));
  });

  it('changes the tools-only hash when a tool description changes', () => {
    const prompt = [{ role: 'user', content: 'do the thing' }];
    const base = [{ name: 'search', description: 'Search the web', parameters: { a: 1 } }];
    const redescribed = [
      { name: 'search', description: 'Search everything', parameters: { a: 1 } },
    ];

    expect(computePrefixSignature(prompt, base)).not.toBe(
      computePrefixSignature(prompt, redescribed)
    );
  });

  it('changes the tools-only hash when tool parameters change', () => {
    const prompt = [{ role: 'user', content: 'do the thing' }];
    const base = [{ name: 'search', description: 'Search the web', parameters: { a: 1 } }];
    const reparametered = [{ name: 'search', description: 'Search the web', parameters: { a: 2 } }];

    expect(computePrefixSignature(prompt, base)).not.toBe(
      computePrefixSignature(prompt, reparametered)
    );
  });

  it('distinguishes structurally different prompts that concatenate to the same bytes', () => {
    const single = computePrefixSignature([{ role: 'system', content: 'foobar' }]);
    const split = computePrefixSignature([
      { role: 'system', content: 'foo' },
      { role: 'system', content: 'bar' },
    ]);

    expect(single).not.toBe(split);
  });

  it('distinguishes a system/tool boundary that would collide under plain concatenation', () => {
    const sysFooToolBar = computePrefixSignature(
      [{ role: 'system', content: 'foo' }],
      [{ name: 'bar' }]
    );
    const sysFoobarToolEmpty = computePrefixSignature(
      [{ role: 'system', content: 'foobar' }],
      [{ name: '' }]
    );

    expect(sysFooToolBar).not.toBe(sysFoobarToolEmpty);
  });

  it('distinguishes system-only from system+tools', () => {
    const prompt = [{ role: 'system', content: 'You are helpful.' }];
    const tools = [{ name: 'search', description: 'Search the web', parameters: { a: 1 } }];

    expect(computePrefixSignature(prompt)).not.toBe(computePrefixSignature(prompt, tools));
  });
});

describe('countCacheMarkers', () => {
  const cacheControlMsg = {
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  };

  it("counts the gateway auto-caching marker but excludes 'off' and 'disabled'", () => {
    expect(countCacheMarkers([], { gateway: { caching: 'auto' } })).toBe(1);
    expect(countCacheMarkers([], { gateway: { caching: 'off' } })).toBe(0);
    expect(countCacheMarkers([], { gateway: { caching: 'disabled' } })).toBe(0);
    expect(countCacheMarkers([], undefined)).toBe(0);
    expect(countCacheMarkers([], {})).toBe(0);
  });

  it('counts per-message anthropic cacheControl markers independently of the gateway flag', () => {
    // 'off' gateway flag contributes 0; the two marked messages still count.
    expect(
      countCacheMarkers([cacheControlMsg, cacheControlMsg], { gateway: { caching: 'off' } })
    ).toBe(2);
  });

  it('caps the marker count at 4', () => {
    const many = Array.from({ length: 6 }, () => cacheControlMsg);
    expect(countCacheMarkers(many, { gateway: { caching: 'auto' } })).toBe(4);
  });
});
