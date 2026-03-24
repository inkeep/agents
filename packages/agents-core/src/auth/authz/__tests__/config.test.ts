import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  SPICEDB_ENDPOINT: undefined as string | undefined,
  SPICEDB_PRESHARED_KEY: undefined as string | undefined,
  SPICEDB_TLS_ENABLED: undefined as boolean | undefined,
}));

vi.mock('../../../env', () => ({
  env: mockEnv,
}));

import { getSpiceDbConfig, isLocalhostEndpoint } from '../config';

describe('authz/config', () => {
  beforeEach(() => {
    mockEnv.SPICEDB_ENDPOINT = undefined;
    mockEnv.SPICEDB_PRESHARED_KEY = undefined;
    mockEnv.SPICEDB_TLS_ENABLED = undefined;
  });

  describe('getSpiceDbConfig', () => {
    it('should return default values when env vars not set', () => {
      const config = getSpiceDbConfig();

      expect(config).toEqual({
        endpoint: 'localhost:50051',
        token: '',
        tlsEnabled: false,
      });
    });

    it('should auto-enable TLS for remote endpoints', () => {
      mockEnv.SPICEDB_ENDPOINT = 'grpc.authzed.com:443';
      mockEnv.SPICEDB_PRESHARED_KEY = 'my-secret-key';

      const config = getSpiceDbConfig();

      expect(config).toEqual({
        endpoint: 'grpc.authzed.com:443',
        token: 'my-secret-key',
        tlsEnabled: true,
      });
    });

    it('should disable TLS for localhost endpoints', () => {
      mockEnv.SPICEDB_ENDPOINT = 'localhost:50051';

      const config = getSpiceDbConfig();

      expect(config.tlsEnabled).toBe(false);
    });

    it('should disable TLS for 127.0.0.1 endpoints', () => {
      mockEnv.SPICEDB_ENDPOINT = '127.0.0.1:50051';

      const config = getSpiceDbConfig();

      expect(config.tlsEnabled).toBe(false);
    });
  });

  describe('isLocalhostEndpoint', () => {
    it('should return true for localhost', () => {
      expect(isLocalhostEndpoint('localhost:50051')).toBe(true);
    });

    it('should return true for 127.0.0.1', () => {
      expect(isLocalhostEndpoint('127.0.0.1:50051')).toBe(true);
    });

    it('should return false for remote endpoints', () => {
      expect(isLocalhostEndpoint('grpc.authzed.com:443')).toBe(false);
    });
  });
});
