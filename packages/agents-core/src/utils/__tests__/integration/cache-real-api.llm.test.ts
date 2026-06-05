import { randomUUID } from 'node:crypto';
import { gateway } from '@ai-sdk/gateway';
import { type Span, trace } from '@opentelemetry/api';
import { generateText, wrapLanguageModel } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPAN_KEYS } from '../../../constants/otel-attributes';
import { assertCacheSpanKeys } from '../helpers/cache-contracts';

const RUN_LIVE = Boolean(process.env.INKEEP_ALLOW_MODEL_REQUESTS);

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod ' +
  'tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
  'quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo ' +
  'consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse ' +
  'cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat ' +
  'non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ';
const FILLER = LOREM.repeat(60);

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

const { gatewayCostMiddleware } = await import('../../usage-cost-middleware');

function readCacheAttrs(calls: unknown[][]) {
  const attrs = new Map(calls.map((c) => [c[0], c[1]] as [string, unknown]));
  return {
    cacheReadTokens: attrs.get(SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS) as number,
    cacheCreationTokens: attrs.get(SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS) as number,
    markerCount: attrs.get(SPAN_KEYS.CACHE_INTENT_MARKER_COUNT) as number,
    prefixSignature: attrs.get(SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE) as string,
  };
}

describe.skipIf(!RUN_LIVE)('cache-real-api (live, gateway caching:auto)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the cache prefix on call 1 and reads it cross-turn on call 2', async () => {
    const model = wrapLanguageModel({
      model: gateway('anthropic/claude-sonnet-4-5') as Parameters<
        typeof wrapLanguageModel
      >[0]['model'],
      middleware: gatewayCostMiddleware,
    });

    // Per-run nonce makes the system prefix unique across runs, so call 1 is a
    // guaranteed cold write and call 2 a warm read regardless of a prior run's
    // cache still being live within Anthropic's 5-minute TTL.
    const systemPrefix = `${randomUUID()}\n${FILLER}`;
    const callOptions = {
      model,
      maxOutputTokens: 16,
      providerOptions: { gateway: { caching: 'auto' } },
      messages: [
        { role: 'system' as const, content: systemPrefix },
        { role: 'user' as const, content: 'Reply with exactly: ok' },
      ],
    };

    mockSetAttribute.mockClear();
    await generateText(callOptions);
    const call1 = readCacheAttrs(mockSetAttribute.mock.calls);

    mockSetAttribute.mockClear();
    await generateText(callOptions);
    const call2 = readCacheAttrs(mockSetAttribute.mock.calls);

    expect(call1.markerCount).toBeGreaterThan(0);
    expect(call2.markerCount).toBeGreaterThan(0);

    expect(call1.cacheCreationTokens).toBeGreaterThan(0);
    expect(call2.cacheReadTokens).toBeGreaterThan(0);

    expect(call2.cacheReadTokens).toBeGreaterThan(1000);
    expect(call2.cacheReadTokens).toBeLessThan(100000);

    expect(call1.prefixSignature).toBe(call2.prefixSignature);

    // Same contract helper the hermetic tier calls: a hermetic-pass + live-fail
    // outcome localizes drift to the substrate (mock vs real SDK/gateway/provider).
    assertCacheSpanKeys(mockSetAttribute.mock.calls, {
      cacheReadTokens: call2.cacheReadTokens,
      cacheCreationTokens: call2.cacheCreationTokens,
      markerCount: call2.markerCount,
    });
  }, 120000);
});
