import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthHeaders,
  loadCIEnvironmentConfig,
  validateCIConfig,
} from '../../utils/ci-environment';

describe('CI Environment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadCIEnvironmentConfig', () => {
    it('should return null when INKEEP_API_KEY is not set', () => {
      delete process.env.INKEEP_API_KEY;
      const config = loadCIEnvironmentConfig();
      expect(config).toBeNull();
    });

    it('should load config from environment variables', () => {
      process.env.INKEEP_API_KEY = 'test-api-key';
      process.env.INKEEP_MANAGE_API_URL = 'https://custom-api.example.com';
      process.env.INKEEP_RUN_API_URL = 'https://custom-run.example.com';
      process.env.INKEEP_ENVIRONMENT = 'staging';
      process.env.INKEEP_TENANT_ID = 'test-tenant';

      const config = loadCIEnvironmentConfig();

      expect(config).not.toBeNull();
      expect(config?.apiKey).toBe('test-api-key');
      expect(config?.manageApiUrl).toBe('https://custom-api.example.com');
      expect(config?.runApiUrl).toBe('https://custom-run.example.com');
      expect(config?.environment).toBe('staging');
      expect(config?.tenantId).toBe('test-tenant');
    });

    it('should use default values when optional env vars are not set', () => {
      process.env.INKEEP_API_KEY = 'test-api-key';
      delete process.env.INKEEP_MANAGE_API_URL;
      delete process.env.INKEEP_RUN_API_URL;
      delete process.env.INKEEP_ENVIRONMENT;

      const config = loadCIEnvironmentConfig();

      expect(config).not.toBeNull();
      expect(config?.manageApiUrl).toBe('https://manage-api.inkeep.com');
      expect(config?.runApiUrl).toBe('https://run-api.inkeep.com');
      expect(config?.environment).toBe('production');
    });
  });

  describe('getAuthHeaders', () => {
    it('should return X-API-Key header in CI mode', () => {
      const headers = getAuthHeaders({ apiKey: 'test-api-key' }, true);
      expect(headers['X-API-Key']).toBe('test-api-key');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should return Authorization Bearer header in interactive mode', () => {
      const headers = getAuthHeaders({ accessToken: 'test-token' }, false);
      expect(headers['Authorization']).toBe('Bearer test-token');
      expect(headers['X-API-Key']).toBeUndefined();
    });

    it('should return empty headers when no credentials provided', () => {
      const headers = getAuthHeaders({}, false);
      expect(headers).toEqual({});
    });
  });

  describe('validateCIConfig', () => {
    it('should validate config with API key', () => {
      const config = {
        isCI: true,
        apiKey: 'test-key',
        manageApiUrl: 'https://api.example.com',
        runApiUrl: 'https://run.example.com',
        environment: 'production',
      };

      const result = validateCIConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation without API key', () => {
      const config = {
        isCI: true,
        apiKey: undefined,
        manageApiUrl: 'https://api.example.com',
        runApiUrl: 'https://run.example.com',
        environment: 'production',
      };

      const result = validateCIConfig(config as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('INKEEP_API_KEY environment variable is required in CI mode');
    });
  });
});
