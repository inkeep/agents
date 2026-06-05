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
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: 'abc123',
        cacheRead: 8000,
        priorSignature: 'abc123',
      })
    ).toBe('HIT');
  });

  it('returns HIT on a cache read regardless of priorSignature (cache_read short-circuits first)', () => {
    // cache_read > 0 returns HIT before the priorSignature comparison, so a first-turn
    // hit (priorSignature null) must still classify as HIT, not MISS-expected.
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: 'abc123',
        cacheRead: 8000,
        priorSignature: null,
      })
    ).toBe('HIT');
  });

  it('returns MISS-regression when markers present, cache_read=0, and prefix matches prior', () => {
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: 'abc123',
        cacheRead: 0,
        priorSignature: 'abc123',
      })
    ).toBe('MISS-regression');
  });

  it('returns MISS-expected when markers present, cache_read=0, and prefix differs from prior', () => {
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: 'abc123',
        cacheRead: 0,
        priorSignature: 'def456',
      })
    ).toBe('MISS-expected');
  });

  it('returns MISS-expected when markers present, cache_read=0, and no prior signature exists', () => {
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: 'abc123',
        cacheRead: 0,
        priorSignature: null,
      })
    ).toBe('MISS-expected');
  });

  it('returns NOT-ATTEMPTED when marker_count is 0 and provider supports caching', () => {
    expect(
      deriveCacheState({
        markerCount: 0,
        prefixSignature: 'abc123',
        cacheRead: 0,
        priorSignature: null,
      })
    ).toBe('NOT-ATTEMPTED');
  });

  it('returns NOT-SUPPORTED-BY-PROVIDER when providerSupportsCaching is false', () => {
    expect(
      deriveCacheState({
        markerCount: 0,
        prefixSignature: null,
        cacheRead: 0,
        priorSignature: null,
        providerSupportsCaching: false,
      })
    ).toBe('NOT-SUPPORTED-BY-PROVIDER');
  });

  it('returns NOT-SUPPORTED-BY-PROVIDER even when markers/cache_read look HIT-like', () => {
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: 'abc123',
        cacheRead: 8000,
        priorSignature: 'abc123',
        providerSupportsCaching: false,
      })
    ).toBe('NOT-SUPPORTED-BY-PROVIDER');
  });

  it('defaults priorSignature to null when omitted', () => {
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: 'abc123',
        cacheRead: 0,
      })
    ).toBe('MISS-expected');
  });

  it('defaults providerSupportsCaching to true when omitted', () => {
    expect(
      deriveCacheState({
        markerCount: 0,
        prefixSignature: null,
        cacheRead: 0,
      })
    ).toBe('NOT-ATTEMPTED');
  });

  it('returns MISS-expected when markers present, cache_read=0, and prefix_signature is empty/null', () => {
    expect(
      deriveCacheState({
        markerCount: 1,
        prefixSignature: null,
        cacheRead: 0,
        priorSignature: 'abc123',
      })
    ).toBe('MISS-expected');
  });
});
