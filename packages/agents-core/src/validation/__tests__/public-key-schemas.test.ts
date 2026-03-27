import { describe, expect, it } from 'vitest';
import {
  PublicKeyAlgorithmSchema,
  PublicKeyConfigSchema,
  WebClientAuthConfigSchema,
  WebClientConfigSchema,
} from '../schemas';

describe('PublicKeyAlgorithmSchema', () => {
  it('accepts valid algorithms', () => {
    for (const alg of ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA']) {
      expect(PublicKeyAlgorithmSchema.parse(alg)).toBe(alg);
    }
  });

  it('rejects invalid algorithms', () => {
    expect(() => PublicKeyAlgorithmSchema.parse('HS256')).toThrow();
    expect(() => PublicKeyAlgorithmSchema.parse('none')).toThrow();
  });
});

describe('PublicKeyConfigSchema', () => {
  const validKey = {
    kid: 'key-1',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----',
    algorithm: 'RS256',
    addedAt: '2026-03-24T00:00:00Z',
  };

  it('accepts valid public key config', () => {
    const result = PublicKeyConfigSchema.parse(validKey);
    expect(result.kid).toBe('key-1');
    expect(result.algorithm).toBe('RS256');
  });

  it('rejects empty kid', () => {
    expect(() => PublicKeyConfigSchema.parse({ ...validKey, kid: '' })).toThrow();
  });

  it('rejects empty publicKey', () => {
    expect(() => PublicKeyConfigSchema.parse({ ...validKey, publicKey: '' })).toThrow();
  });

  it('rejects invalid addedAt format', () => {
    expect(() => PublicKeyConfigSchema.parse({ ...validKey, addedAt: 'not-a-date' })).toThrow();
  });

  it('rejects invalid algorithm', () => {
    expect(() => PublicKeyConfigSchema.parse({ ...validKey, algorithm: 'HS256' })).toThrow();
  });
});

describe('WebClientAuthConfigSchema', () => {
  it('accepts empty publicKeys array', () => {
    const result = WebClientAuthConfigSchema.parse({ publicKeys: [] });
    expect(result.publicKeys).toEqual([]);
    expect(result.audience).toBeUndefined();
  });

  it('defaults publicKeys to empty array', () => {
    const result = WebClientAuthConfigSchema.parse({});
    expect(result.publicKeys).toEqual([]);
  });

  it('accepts audience string', () => {
    const result = WebClientAuthConfigSchema.parse({ publicKeys: [], audience: 'my-app' });
    expect(result.audience).toBe('my-app');
  });

  it('accepts many keys (no limit)', () => {
    const keys = Array.from({ length: 10 }, (_, i) => ({
      kid: `key-${i}`,
      publicKey: 'pem-data',
      algorithm: 'RS256',
      addedAt: '2026-03-24T00:00:00Z',
    }));
    const result = WebClientAuthConfigSchema.parse({ publicKeys: keys });
    expect(result.publicKeys).toHaveLength(10);
  });
});

describe('WebClientConfigSchema with auth', () => {
  const baseConfig = {
    type: 'web_client' as const,
    webClient: {
      allowedDomains: ['example.com'],
    },
  };

  it('accepts config without auth (backward compatible)', () => {
    const result = WebClientConfigSchema.parse(baseConfig);
    expect(result.webClient.auth).toBeUndefined();
  });

  it('accepts config with auth block', () => {
    const result = WebClientConfigSchema.parse({
      ...baseConfig,
      webClient: {
        ...baseConfig.webClient,
        auth: {
          publicKeys: [
            {
              kid: 'key-1',
              publicKey: 'pem-data',
              algorithm: 'ES256',
              addedAt: '2026-03-24T00:00:00Z',
            },
          ],
          audience: 'https://api.example.com',
        },
      },
    });
    expect(result.webClient.auth?.publicKeys).toHaveLength(1);
    expect(result.webClient.auth?.audience).toBe('https://api.example.com');
  });
});
