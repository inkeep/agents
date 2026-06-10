import { describe, expect, it } from 'vitest';
import { deriveCacheState, resolveCachingProvider } from '../cache-state';

describe('resolveCachingProvider', () => {
  it('prefers the resolved response provider over the request-side provider', () => {
    // Gateway-routed: ai.model.provider='gateway', gen_ai.response.provider='anthropic'.
    expect(
      resolveCachingProvider({ requestProvider: 'gateway', responseProvider: 'anthropic' })
    ).toBe('anthropic');
  });

  it('falls back to the request provider when the response provider is absent', () => {
    expect(resolveCachingProvider({ requestProvider: 'anthropic', responseProvider: '' })).toBe(
      'anthropic'
    );
    expect(resolveCachingProvider({ requestProvider: 'anthropic', responseProvider: null })).toBe(
      'anthropic'
    );
    expect(resolveCachingProvider({ requestProvider: 'anthropic' })).toBe('anthropic');
  });

  it('returns empty string when neither provider is present', () => {
    expect(resolveCachingProvider({})).toBe('');
    expect(resolveCachingProvider({ requestProvider: '', responseProvider: '' })).toBe('');
  });

  it('trims surrounding whitespace from the resolved provider', () => {
    expect(
      resolveCachingProvider({ requestProvider: 'gateway', responseProvider: '  anthropic ' })
    ).toBe('anthropic');
  });
});

describe('deriveCacheState', () => {
  it('returns HIT when markers present and cache_read > 0', () => {
    expect(deriveCacheState({ markerCount: 1, cacheRead: 8000 })).toBe('HIT');
  });

  it('returns MISS when markers present and cache_read = 0', () => {
    expect(deriveCacheState({ markerCount: 1, cacheRead: 0 })).toBe('MISS');
  });

  it('returns HIT on a cache read even when marker_count is 0 (read wins — trace store can drop the marker)', () => {
    expect(deriveCacheState({ markerCount: 0, cacheRead: 8000 })).toBe('HIT');
  });

  it('returns NOT-ATTEMPTED when marker_count is 0 and provider supports caching', () => {
    expect(deriveCacheState({ markerCount: 0, cacheRead: 0 })).toBe('NOT-ATTEMPTED');
  });

  it('returns NOT-SUPPORTED-BY-PROVIDER when providerSupportsCaching is false', () => {
    expect(deriveCacheState({ markerCount: 0, cacheRead: 0, providerSupportsCaching: false })).toBe(
      'NOT-SUPPORTED-BY-PROVIDER'
    );
  });

  it('returns NOT-SUPPORTED-BY-PROVIDER even when markers/cache_read look HIT-like', () => {
    expect(
      deriveCacheState({ markerCount: 1, cacheRead: 8000, providerSupportsCaching: false })
    ).toBe('NOT-SUPPORTED-BY-PROVIDER');
  });

  it('defaults providerSupportsCaching to true when omitted', () => {
    expect(deriveCacheState({ markerCount: 0, cacheRead: 0 })).toBe('NOT-ATTEMPTED');
  });
});
