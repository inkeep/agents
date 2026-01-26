import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Store original env values
const originalEnv = { ...process.env };

// Mock the env module
const mockEnv = {
  GITHUB_APP_ID: undefined as string | undefined,
  GITHUB_APP_PRIVATE_KEY: undefined as string | undefined,
  GITHUB_WEBHOOK_SECRET: undefined as string | undefined,
};

vi.mock('../../env', () => ({
  env: mockEnv,
}));

// Mock the logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('../../logger', () => ({
  getLogger: () => mockLogger,
}));

// Import after mocks are set up
import {
  clearConfigCache,
  getGitHubAppConfig,
  getWebhookSecret,
  isGitHubAppConfigured,
  isWebhookConfigured,
  validateGitHubAppConfigOnStartup,
  validateGitHubWebhookConfigOnStartup,
} from '../../domains/github/config';

describe('GitHub Config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearConfigCache();
    // Reset mock env values
    mockEnv.GITHUB_APP_ID = undefined;
    mockEnv.GITHUB_APP_PRIVATE_KEY = undefined;
    mockEnv.GITHUB_WEBHOOK_SECRET = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });

  describe('isGitHubAppConfigured', () => {
    it('should return true when both GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are set', () => {
      mockEnv.GITHUB_APP_ID = '123456';
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      expect(isGitHubAppConfigured()).toBe(true);
    });

    it('should return false when GITHUB_APP_ID is missing', () => {
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      expect(isGitHubAppConfigured()).toBe(false);
    });

    it('should return false when GITHUB_APP_PRIVATE_KEY is missing', () => {
      mockEnv.GITHUB_APP_ID = '123456';

      expect(isGitHubAppConfigured()).toBe(false);
    });

    it('should return false when both values are missing', () => {
      expect(isGitHubAppConfigured()).toBe(false);
    });
  });

  describe('getGitHubAppConfig', () => {
    it('should return config when both values are set', () => {
      mockEnv.GITHUB_APP_ID = '123456';
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      const config = getGitHubAppConfig();

      expect(config.appId).toBe('123456');
      expect(config.privateKey).toBe('-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----');
    });

    it('should handle escaped newlines in private key', () => {
      mockEnv.GITHUB_APP_ID = '123456';
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\\ntest\\n-----END RSA PRIVATE KEY-----';

      const config = getGitHubAppConfig();

      expect(config.privateKey).toBe('-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----');
    });

    it('should throw error when GITHUB_APP_ID is missing', () => {
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      expect(() => getGitHubAppConfig()).toThrow('GITHUB_APP_ID is required');
    });

    it('should throw error when GITHUB_APP_PRIVATE_KEY is missing', () => {
      mockEnv.GITHUB_APP_ID = '123456';

      expect(() => getGitHubAppConfig()).toThrow('GITHUB_APP_PRIVATE_KEY is required');
    });

    it('should cache config after first successful call', () => {
      mockEnv.GITHUB_APP_ID = '123456';
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      const config1 = getGitHubAppConfig();

      // Change env (should not affect cached result)
      mockEnv.GITHUB_APP_ID = '999999';

      const config2 = getGitHubAppConfig();

      expect(config1).toBe(config2);
      expect(config2.appId).toBe('123456'); // Still the cached value
    });
  });

  describe('validateGitHubAppConfigOnStartup', () => {
    it('should log warning when GitHub App is not configured', () => {
      validateGitHubAppConfigOnStartup();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {},
        expect.stringContaining('GitHub App credentials not configured')
      );
    });

    it('should not log warning when GitHub App is configured', () => {
      mockEnv.GITHUB_APP_ID = '123456';
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      validateGitHubAppConfigOnStartup();

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith({}, 'GitHub App credentials loaded successfully');
    });
  });

  describe('isWebhookConfigured', () => {
    it('should return true when GITHUB_WEBHOOK_SECRET is set', () => {
      mockEnv.GITHUB_WEBHOOK_SECRET = 'my-secret-value';

      expect(isWebhookConfigured()).toBe(true);
    });

    it('should return false when GITHUB_WEBHOOK_SECRET is not set', () => {
      expect(isWebhookConfigured()).toBe(false);
    });

    it('should return false when GITHUB_WEBHOOK_SECRET is empty string', () => {
      mockEnv.GITHUB_WEBHOOK_SECRET = '';

      expect(isWebhookConfigured()).toBe(false);
    });
  });

  describe('getWebhookSecret', () => {
    it('should return the webhook secret when configured', () => {
      mockEnv.GITHUB_WEBHOOK_SECRET = 'my-secret-value';

      expect(getWebhookSecret()).toBe('my-secret-value');
    });

    it('should throw error when GITHUB_WEBHOOK_SECRET is not configured', () => {
      expect(() => getWebhookSecret()).toThrow('GITHUB_WEBHOOK_SECRET is not configured');
    });
  });

  describe('validateGitHubWebhookConfigOnStartup', () => {
    it('should log warning when webhook secret is not configured', () => {
      validateGitHubWebhookConfigOnStartup();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {},
        expect.stringContaining('GitHub webhook secret not configured')
      );
    });

    it('should not log warning when webhook secret is configured', () => {
      mockEnv.GITHUB_WEBHOOK_SECRET = 'my-secret-value';

      validateGitHubWebhookConfigOnStartup();

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('clearConfigCache', () => {
    it('should clear the cached config', () => {
      mockEnv.GITHUB_APP_ID = '123456';
      mockEnv.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';

      // Get config to cache it
      const config1 = getGitHubAppConfig();

      // Clear cache
      clearConfigCache();

      // Change env
      mockEnv.GITHUB_APP_ID = '999999';

      // Get config again - should use new value
      const config2 = getGitHubAppConfig();

      expect(config2.appId).toBe('999999');
      expect(config1.appId).toBe('123456');
    });
  });
});
