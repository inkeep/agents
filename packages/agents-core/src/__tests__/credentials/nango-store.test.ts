import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NangoCredentialStore } from '../../credential-stores/nango-store';

// Mock the logger
vi.mock('../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock fetch
global.fetch = vi.fn();

describe('NangoCredentialStore', () => {
  let store: NangoCredentialStore;
  const mockConfig = {
    secretKey: 'test-secret-key',
    apiUrl: 'https://api.nango.dev',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store = new NangoCredentialStore('nango-test', mockConfig);
  });

  describe('get', () => {
    it('should parse JSON key and fetch credentials', async () => {
      const mockNangoResponse = {
        credentials: {
          type: 'OAUTH2',
          access_token: 'oauth-access-token',
        },
        provider: 'test',
        metadata: {},
      } as any;

      (store as any).nangoClient = {
        getConnection: vi.fn().mockResolvedValueOnce(mockNangoResponse),
      } as any;

      const key = JSON.stringify({
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
      });

      const result = await store.get(key);

      const parsedResult = JSON.parse(result ?? '{}');
      expect(parsedResult).toEqual({
        token: 'oauth-access-token',
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
        provider: 'test',
        secretKey: 'test-secret-key',
        metadata: {},
      });
    });

    it('should return null for invalid JSON key', async () => {
      const result = await store.get('invalid-json-key');
      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return null when SDK getConnection fails', async () => {
      (store as any).nangoClient = {
        getConnection: vi.fn().mockRejectedValueOnce(new Error('Not Found')),
      } as any;

      const key = JSON.stringify({
        connectionId: 'non-existent',
        providerConfigKey: 'test-provider',
      });

      const result = await store.get(key);
      expect(result).toBeNull();
    });

    // removed fetch network error case; SDK is mocked directly

    it('should handle missing access_token in response', async () => {
      const mockNangoResponse = {
        credentials: {
          type: 'OAUTH2',
          // Missing access_token
        },
        provider: 'test',
        metadata: {},
      } as any;

      (store as any).nangoClient = {
        getConnection: vi.fn().mockResolvedValueOnce(mockNangoResponse),
      } as any;

      const key = JSON.stringify({
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
      });

      const result = await store.get(key);

      const parsedResult = JSON.parse(result ?? '{}');
      expect(parsedResult.token).toBeUndefined();
      expect(parsedResult).toMatchObject({
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
        provider: 'test',
        secretKey: 'test-secret-key',
        metadata: {},
      });
    });
  });

  describe('fetchCredentialsFromNango', () => {
    it('should handle SDK errors gracefully', async () => {
      (store as any).nangoClient = {
        getConnection: vi.fn().mockRejectedValueOnce(new Error('Unauthorized')),
      } as any;

      const result = await (store as any).fetchCredentialsFromNango(
        'test-connection',
        'test-provider'
      );
      expect(result).toBeNull();
    });

    it('should preserve provider and sanitize metadata', async () => {
      const sdkResponse = {
        credentials: { access_token: 'test-token' },
        provider: 'slack',
        metadata: { a: '1', b: 2, c: null },
      } as any;

      (store as any).nangoClient = {
        getConnection: vi.fn().mockResolvedValueOnce(sdkResponse),
      } as any;

      const result = await (store as any).fetchCredentialsFromNango(
        'test-connection',
        'slack-prod-v2'
      );

      expect(result?.provider).toBe('slack');
      expect(result?.metadata).toEqual({ a: '1' });
    });
  });

  describe('Configuration', () => {
    it('should use provided apiUrl', () => {
      const customStore = new NangoCredentialStore('custom', {
        secretKey: 'test-key',
        apiUrl: 'https://custom-nango.com',
      });

      expect((customStore as any).nangoConfig.apiUrl).toBe('https://custom-nango.com');
    });

    it('should use default apiUrl when not provided', () => {
      const defaultStore = new NangoCredentialStore('default', {
        secretKey: 'test-key',
      });

      expect((defaultStore as any).nangoConfig.apiUrl).toBeUndefined();
    });

    it('should store correct id and secretKey', () => {
      expect(store.id).toBe('nango-test');
      expect((store as any).nangoConfig.secretKey).toBe('test-secret-key');
    });
  });
});
