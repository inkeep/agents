import { describe, expect, it } from 'vitest';
import { credential } from '../../builderFunctions';

describe('credential builder function', () => {
  it('should create a credential with required fields', () => {
    const testCredential = credential({
      id: 'test-api-key',
      name: 'Test API Key',
      type: 'memory',
      credentialStoreId: 'memory-default',
      retrievalParams: {
        key: 'TEST_API_KEY',
      },
    });

    expect(testCredential).toEqual({
      id: 'test-api-key',
      name: 'Test API Key',
      type: 'memory',
      credentialStoreId: 'memory-default',
      retrievalParams: {
        key: 'TEST_API_KEY',
      },
    });
  });

  it('should handle different credential types', () => {
    const oauthCredential = credential({
      id: 'oauth-token',
      name: 'OAuth Token',
      type: 'nango',
      credentialStoreId: 'oauth-store',
      retrievalParams: {
        clientId: 'client123',
        scope: 'read:all',
      },
    });

    expect(oauthCredential.type).toBe('nango');
    expect(oauthCredential.retrievalParams).toEqual({
      clientId: 'client123',
      scope: 'read:all',
    });
  });

  it('should handle vault credentials', () => {
    const vaultCredential = credential({
      id: 'vault-secret',
      name: 'Vault Secret',
      type: 'keychain',
      credentialStoreId: 'hashicorp-vault',
      retrievalParams: {
        path: '/secret/data/api-keys',
        field: 'apiKey',
      },
    });

    expect(vaultCredential.type).toBe('keychain');
    expect(vaultCredential.credentialStoreId).toBe('hashicorp-vault');
  });

  it('should handle nango credentials', () => {
    const nangoCredential = credential({
      id: 'nango-integration',
      name: 'Nango Integration',
      type: 'nango',
      credentialStoreId: 'nango-default',
      retrievalParams: {
        connectionId: 'conn123',
        providerConfigKey: 'github',
      },
    });

    expect(nangoCredential.type).toBe('nango');
    expect(nangoCredential.retrievalParams?.connectionId).toBe('conn123');
  });

  it('should handle empty retrieval params', () => {
    const simpleCredential = credential({
      id: 'simple',
      name: 'Simple Credential',
      type: 'memory',
      credentialStoreId: 'memory-default',
      retrievalParams: {},
    });

    expect(simpleCredential.retrievalParams).toEqual({});
  });

  it('should handle optional retrieval params fields', () => {
    const credWithOptionals = credential({
      id: 'with-optionals',
      name: 'Credential With Optionals',
      type: 'memory',
      credentialStoreId: 'memory-default',
      retrievalParams: {
        key: 'API_KEY',
        environment: 'production',
        region: 'us-west-2',
      },
    });

    expect(credWithOptionals.retrievalParams?.key).toBe('API_KEY');
    expect(credWithOptionals.retrievalParams?.environment).toBe('production');
    expect(credWithOptionals.retrievalParams?.region).toBe('us-west-2');
  });

  it('should validate required fields', () => {
    expect(() => {
      // @ts-expect-error - missing required fields
      credential({
        id: 'test',
      });
    }).toThrow();

    expect(() => {
      // @ts-expect-error - missing id
      credential({
        type: 'memory',
        credentialStoreId: 'memory-default',
        retrievalParams: {},
      });
    }).toThrow();
  });
});
