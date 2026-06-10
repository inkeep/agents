export type CacheState = 'HIT' | 'MISS' | 'NOT-ATTEMPTED' | 'NOT-SUPPORTED-BY-PROVIDER';

// Providers with server-side prompt caching. Mirrors the gateway-routable set
// (anthropic, openai, google) plus 'gemini' as an explicit forward-compatibility
// alias: gemini models normally resolve to the 'google' provider string (via
// ModelFactory.parseModelString and gateway routing.finalProvider), but keeping
// isProviderSupportedForCaching('gemini') true means a future SDK that reports
// 'gemini' directly won't silently lose caching support.
const CACHING_SUPPORTED_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'gemini']);

export function isProviderSupportedForCaching(provider: string): boolean {
  return CACHING_SUPPORTED_PROVIDERS.has(provider.toLowerCase());
}

/**
 * Resolve the provider to use for the caching-support gate.
 *
 * Vercel-AI-Gateway-routed deployments report `ai.model.provider = 'gateway'`,
 * which is a router, not a caching-capable provider. The actual model provider
 * that produced the response (and owns the cache keys) lives in
 * `gen_ai.response.provider`. Prefer that resolved provider when present so the
 * support gate reflects the real backend (e.g. 'anthropic'); fall back to the
 * request-side `ai.model.provider` only when the resolved provider is absent.
 */
export function resolveCachingProvider({
  requestProvider,
  responseProvider,
}: {
  requestProvider?: string | null;
  responseProvider?: string | null;
}): string {
  return (responseProvider || requestProvider || '').trim();
}

export interface DeriveCacheStateInput {
  markerCount: number;
  cacheRead: number;
  providerSupportsCaching?: boolean;
}

// A call either served input tokens from the provider cache (HIT), attempted caching but did not
// (MISS), placed no cache marker (NOT-ATTEMPTED), or ran on a provider without prompt caching
// (NOT-SUPPORTED-BY-PROVIDER). We deliberately do NOT try to label a MISS a "regression" vs
// "expected": that inference needs a reliable per-call marker_count and prior-signature cursor, and
// the trace store drops those numerics — so the guess was unreliable and alarming. A miss is a miss;
// the prefix_signature is shown alongside for anyone who wants to compare calls by hand.
export function deriveCacheState({
  markerCount,
  cacheRead,
  providerSupportsCaching = true,
}: DeriveCacheStateInput): CacheState {
  if (!providerSupportsCaching) return 'NOT-SUPPORTED-BY-PROVIDER';
  // A cache read is definitive proof of a HIT — you cannot read what was never cached — so it wins
  // over the marker count (which the trace store can drop to 0 even on a real hit).
  if (cacheRead > 0) return 'HIT';
  if (markerCount <= 0) return 'NOT-ATTEMPTED';
  return 'MISS';
}
