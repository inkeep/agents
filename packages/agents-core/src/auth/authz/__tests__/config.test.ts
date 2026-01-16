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
      expect(isAuthzEnabled('test-tenant')).toBe(false);
    });

    it('should return false when ENABLE_AUTHZ is "false"', () => {
      process.env.ENABLE_AUTHZ = 'false';
      expect(isAuthzEnabled('test-tenant')).toBe(false);
    });

    it('should return true when ENABLE_AUTHZ is "true" and no TENANT_ID filter', () => {
      process.env.ENABLE_AUTHZ = 'true';
      delete process.env.TENANT_ID;
      expect(isAuthzEnabled('any-tenant')).toBe(true);
    });

    it('should return false for any other ENABLE_AUTHZ value', () => {
      process.env.ENABLE_AUTHZ = 'yes';
      expect(isAuthzEnabled('test-tenant')).toBe(false);
    });

    it('should return true only for matching tenant when TENANT_ID is set', () => {
      process.env.ENABLE_AUTHZ = 'true';
      process.env.TENANT_ID = 'default';
      expect(isAuthzEnabled('default')).toBe(true);
      expect(isAuthzEnabled('other-tenant')).toBe(false);
    });

    it('should trim TENANT_ID whitespace', () => {
      process.env.ENABLE_AUTHZ = 'true';
      process.env.TENANT_ID = '  default  ';
      expect(isAuthzEnabled('default')).toBe(true);
    });
  });

  describe('getSpiceDbConfig', () => {
    it('should return default values when env vars not set', () => {
      delete process.env.SPICEDB_ENDPOINT;
      delete process.env.SPICEDB_PRESHARED_KEY;
      delete process.env.SPICEDB_TLS_ENABLED;

      const config = getSpiceDbConfig();

      expect(config).toEqual({
        endpoint: 'localhost:50051',
        token: '',
        tlsEnabled: false,
      });
    });

    it('should use environment variables when set', () => {
      process.env.SPICEDB_ENDPOINT = 'grpc.authzed.com:443';
      process.env.SPICEDB_PRESHARED_KEY = 'my-secret-key';
      process.env.SPICEDB_TLS_ENABLED = 'true';

      const config = getSpiceDbConfig();

      expect(config).toEqual({
        endpoint: 'grpc.authzed.com:443',
        token: 'my-secret-key',
        tlsEnabled: true,
      });
    });

    it('should handle TLS disabled explicitly', () => {
      process.env.SPICEDB_TLS_ENABLED = 'false';

      const config = getSpiceDbConfig();

      expect(config.tlsEnabled).toBe(false);
    });
  });
});
