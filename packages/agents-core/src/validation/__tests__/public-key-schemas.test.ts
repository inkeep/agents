import { describe, expect, it } from 'vitest';
import { PublicKeyAlgorithmSchema, PublicKeyConfigSchema, WebClientConfigSchema } from '../schemas';

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

describe('WebClientConfigSchema', () => {
  const baseConfig = {
    type: 'web_client' as const,
    webClient: {
      allowedDomains: ['example.com'],
    },
  };

  it('applies defaults when auth fields are omitted', () => {
    const result = WebClientConfigSchema.parse(baseConfig);
    expect(result.webClient.publicKeys).toEqual([]);
    expect(result.webClient.allowAnonymous).toBe(false);
  });

  it('accepts config with auth fields directly on webClient', () => {
    const result = WebClientConfigSchema.parse({
      ...baseConfig,
      webClient: {
        ...baseConfig.webClient,
        publicKeys: [
          {
            kid: 'key-1',
            publicKey: 'pem-data',
            algorithm: 'ES256',
            addedAt: '2026-03-24T00:00:00Z',
          },
        ],
        audience: 'https://api.example.com',
        allowAnonymous: false,
      },
    });
    expect(result.webClient.publicKeys).toHaveLength(1);
    expect(result.webClient.audience).toBe('https://api.example.com');
    expect(result.webClient.allowAnonymous).toBe(false);
  });

  it('does not accept validateScopeClaims', () => {
    const result = WebClientConfigSchema.parse({
      ...baseConfig,
      webClient: {
        ...baseConfig.webClient,
        validateScopeClaims: true,
      },
    });
    expect((result.webClient as Record<string, unknown>).validateScopeClaims).toBeUndefined();
  });
});
