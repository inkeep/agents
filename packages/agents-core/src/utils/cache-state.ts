export type CacheState =
  | 'HIT'
  | 'MISS-regression'
  | 'MISS-expected'
  | 'NOT-ATTEMPTED'
  | 'NOT-SUPPORTED-BY-PROVIDER';

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
  prefixSignature: string | null;
  cacheRead: number;
  priorSignature?: string | null;
  providerSupportsCaching?: boolean;
}

export function deriveCacheState({
  markerCount,
  prefixSignature,
  cacheRead,
  priorSignature = null,
  providerSupportsCaching = true,
}: DeriveCacheStateInput): CacheState {
  if (!providerSupportsCaching) return 'NOT-SUPPORTED-BY-PROVIDER';
  if (markerCount <= 0) return 'NOT-ATTEMPTED';
  if (cacheRead > 0) return 'HIT';
  if (priorSignature && prefixSignature && prefixSignature === priorSignature) {
    return 'MISS-regression';
  }
  return 'MISS-expected';
}
