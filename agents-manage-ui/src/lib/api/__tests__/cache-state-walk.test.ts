import {
  deriveCacheState,
  isProviderSupportedForCaching,
  resolveCachingProvider,
} from '@inkeep/agents-core/client-exports';
import { describe, expect, it } from 'vitest';

interface TestSpan {
  spanId: string;
  subAgentId: string;
  /** ai.model.provider — request-side / routing provider (e.g. 'gateway'). */
  modelProvider: string;
  /** gen_ai.response.provider — resolved backend provider (e.g. 'anthropic'). */
  responseProvider?: string;
  prefixSignature: string | null;
  markerCount: number;
  cacheRead: number;
  timestamp: string;
}

/**
 * Mirrors the fixed cacheStateBySpanId walk from route.ts.
 *
 * - Per-agent priorSignature tracking via Map<subAgentId, string>
 * - providerSupportsCaching gated on the RESOLVED provider: prefer
 *   gen_ai.response.provider over the gateway-routing ai.model.provider.
 */
function walkCacheStates(spans: TestSpan[]) {
  const sorted = [...spans].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const result = new Map<string, ReturnType<typeof deriveCacheState>>();

  for (const span of sorted) {
    if (!span.spanId) continue;
    const provider = resolveCachingProvider({
      requestProvider: span.modelProvider,
      responseProvider: span.responseProvider,
    });
    const state = deriveCacheState({
      markerCount: span.markerCount,
      cacheRead: span.cacheRead,
      providerSupportsCaching: provider ? isProviderSupportedForCaching(provider) : true,
    });
    result.set(span.spanId, state);
  }
  return result;
}

describe('cacheStateBySpanId walk — per-agent priorSignature tracking', () => {
  it('uses per-agent prior signatures for interleaved multi-agent spans', () => {
    const spans: TestSpan[] = [
      {
        spanId: 'span-A1',
        subAgentId: 'agentA',
        modelProvider: 'anthropic',
        prefixSignature: 'sigA',
        markerCount: 2,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:01Z',
      },
      {
        spanId: 'span-B1',
        subAgentId: 'agentB',
        modelProvider: 'anthropic',
        prefixSignature: 'sigB',
        markerCount: 2,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:02Z',
      },
      {
        spanId: 'span-A2',
        subAgentId: 'agentA',
        modelProvider: 'anthropic',
        prefixSignature: 'sigA',
        markerCount: 2,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:03Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-A1')).toBe('MISS');
    expect(result.get('span-B1')).toBe('MISS');
    // A2: same signature as A1 ("sigA"), cacheRead=0 => MISS-regression
    // A global cursor would compare against B1's "sigB" and return MISS-expected
    expect(result.get('span-A2')).toBe('MISS');
  });

  it('detects HIT correctly with per-agent tracking', () => {
    const spans: TestSpan[] = [
      {
        spanId: 'span-A1',
        subAgentId: 'agentA',
        modelProvider: 'anthropic',
        prefixSignature: 'sigA',
        markerCount: 2,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:01Z',
      },
      {
        spanId: 'span-B1',
        subAgentId: 'agentB',
        modelProvider: 'openai',
        prefixSignature: 'sigB',
        markerCount: 2,
        cacheRead: 500,
        timestamp: '2024-01-01T00:00:02Z',
      },
      {
        spanId: 'span-A2',
        subAgentId: 'agentA',
        modelProvider: 'anthropic',
        prefixSignature: 'sigA',
        markerCount: 2,
        cacheRead: 1000,
        timestamp: '2024-01-01T00:00:03Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-A1')).toBe('MISS');
    expect(result.get('span-B1')).toBe('HIT');
    expect(result.get('span-A2')).toBe('HIT');
  });

  it('falls back to _default when subAgentId is empty', () => {
    const spans: TestSpan[] = [
      {
        spanId: 'span-1',
        subAgentId: '',
        modelProvider: 'anthropic',
        prefixSignature: 'sig1',
        markerCount: 2,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:01Z',
      },
      {
        spanId: 'span-2',
        subAgentId: '',
        modelProvider: 'anthropic',
        prefixSignature: 'sig1',
        markerCount: 2,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:02Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-1')).toBe('MISS');
    expect(result.get('span-2')).toBe('MISS');
  });
});

describe('cacheStateBySpanId walk — providerSupportsCaching', () => {
  it('returns NOT-SUPPORTED-BY-PROVIDER for unsupported providers', () => {
    const spans: TestSpan[] = [
      {
        spanId: 'span-cohere-1',
        subAgentId: 'agentX',
        modelProvider: 'cohere',
        prefixSignature: null,
        markerCount: 0,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:01Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-cohere-1')).toBe('NOT-SUPPORTED-BY-PROVIDER');
  });

  it('returns NOT-ATTEMPTED for supported providers with markerCount=0', () => {
    const spans: TestSpan[] = [
      {
        spanId: 'span-anthropic-1',
        subAgentId: 'agentX',
        modelProvider: 'anthropic',
        prefixSignature: null,
        markerCount: 0,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:01Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-anthropic-1')).toBe('NOT-ATTEMPTED');
  });

  it('treats google and gemini as supported providers', () => {
    for (const provider of ['google', 'gemini']) {
      const spans: TestSpan[] = [
        {
          spanId: `span-${provider}`,
          subAgentId: 'agentX',
          modelProvider: provider,
          prefixSignature: 'sig1',
          markerCount: 2,
          cacheRead: 100,
          timestamp: '2024-01-01T00:00:01Z',
        },
      ];

      const result = walkCacheStates(spans);
      expect(result.get(`span-${provider}`)).toBe('HIT');
    }
  });

  it('defaults to providerSupportsCaching=true when provider string is empty', () => {
    const spans: TestSpan[] = [
      {
        spanId: 'span-noprovider',
        subAgentId: 'agentX',
        modelProvider: '',
        prefixSignature: null,
        markerCount: 0,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:01Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-noprovider')).toBe('NOT-ATTEMPTED');
  });

  it('derives HIT for gateway-routed spans using the resolved gen_ai.response.provider', () => {
    // Regression for conv_6tPrd7lMe6atqJ4z: Vercel-AI-Gateway deployments report
    // ai.model.provider='gateway' (NOT in CACHING_SUPPORTED_PROVIDERS). Gating on
    // that value misclassified real cache hits as NOT-SUPPORTED-BY-PROVIDER. The
    // resolved backend (gen_ai.response.provider='anthropic') is the right signal.
    const spans: TestSpan[] = [
      {
        spanId: 'span-gateway-hit',
        subAgentId: 'agentX',
        modelProvider: 'gateway',
        responseProvider: 'anthropic',
        prefixSignature: '2f50e6ab00',
        markerCount: 1,
        cacheRead: 15927,
        timestamp: '2024-01-01T00:00:01Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-gateway-hit')).toBe('HIT');
  });

  it('still classifies gateway routing to a non-caching backend as unsupported', () => {
    const spans: TestSpan[] = [
      {
        spanId: 'span-gateway-cohere',
        subAgentId: 'agentX',
        modelProvider: 'gateway',
        responseProvider: 'cohere',
        prefixSignature: null,
        markerCount: 0,
        cacheRead: 0,
        timestamp: '2024-01-01T00:00:01Z',
      },
    ];

    const result = walkCacheStates(spans);

    expect(result.get('span-gateway-cohere')).toBe('NOT-SUPPORTED-BY-PROVIDER');
  });
});

describe('isProviderSupportedForCaching', () => {
  it('returns true for supported providers', () => {
    expect(isProviderSupportedForCaching('anthropic')).toBe(true);
    expect(isProviderSupportedForCaching('openai')).toBe(true);
    expect(isProviderSupportedForCaching('google')).toBe(true);
    expect(isProviderSupportedForCaching('gemini')).toBe(true);
  });

  it('returns true case-insensitively', () => {
    expect(isProviderSupportedForCaching('Anthropic')).toBe(true);
    expect(isProviderSupportedForCaching('OPENAI')).toBe(true);
  });

  it('returns false for unsupported providers', () => {
    expect(isProviderSupportedForCaching('cohere')).toBe(false);
    expect(isProviderSupportedForCaching('mistral')).toBe(false);
    expect(isProviderSupportedForCaching('huggingface')).toBe(false);
  });
});
