import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSpiceDbConfig, isAuthzEnabled } from '../config';

describe('authz/config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isAuthzEnabled', () => {
    it('should return false when ENABLE_AUTHZ is not set', () => {
      delete process.env.ENABLE_AUTHZ;
      expect(isAuthzEnabled()).toBe(false);
    });

    it('should return false when ENABLE_AUTHZ is "false"', () => {
      process.env.ENABLE_AUTHZ = 'false';
      expect(isAuthzEnabled()).toBe(false);
    });

    it('should return false for any other ENABLE_AUTHZ value', () => {
      process.env.ENABLE_AUTHZ = 'yes';
      expect(isAuthzEnabled()).toBe(false);
    });
  });

  describe('getSpiceDbConfig', () => {
    it('should return default values when env vars not set', () => {
      delete process.env.SPICEDB_ENDPOINT;
      delete process.env.SPICEDB_PRESHARED_KEY;

      const config = getSpiceDbConfig();

      expect(config).toEqual({
        endpoint: 'localhost:50051',
        token: '',
        tlsEnabled: false,
      });
    });

    it('should auto-enable TLS for remote endpoints', () => {
      process.env.SPICEDB_ENDPOINT = 'grpc.authzed.com:443';
      process.env.SPICEDB_PRESHARED_KEY = 'my-secret-key';

      const config = getSpiceDbConfig();

      expect(config).toEqual({
        endpoint: 'grpc.authzed.com:443',
        token: 'my-secret-key',
        tlsEnabled: true,
      });
    });

    it('should disable TLS for localhost endpoints', () => {
      process.env.SPICEDB_ENDPOINT = 'localhost:50051';

      const config = getSpiceDbConfig();

      expect(config.tlsEnabled).toBe(false);
    });

    it('should disable TLS for 127.0.0.1 endpoints', () => {
      process.env.SPICEDB_ENDPOINT = '127.0.0.1:50051';

      const config = getSpiceDbConfig();

      expect(config.tlsEnabled).toBe(false);
    });
  });
});
