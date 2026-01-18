import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Instrumentation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to ensure fresh imports
    vi.resetModules();
    // Create a fresh copy of process.env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('isLangfuseConfigured', () => {
    it('should return false when Langfuse is not enabled', async () => {
      process.env.LANGFUSE_ENABLED = 'false';
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';

      // Import after setting env vars
      const { isLangfuseConfigured } = await import('../instrumentation');

      expect(isLangfuseConfigured()).toBe(false);
    });

    it('should return false when secret key is missing', async () => {
      process.env.LANGFUSE_ENABLED = 'true';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';
      delete process.env.LANGFUSE_SECRET_KEY;

      const { isLangfuseConfigured } = await import('../instrumentation');

      expect(isLangfuseConfigured()).toBe(false);
    });

    it('should return false when public key is missing', async () => {
      process.env.LANGFUSE_ENABLED = 'true';
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
      delete process.env.LANGFUSE_PUBLIC_KEY;

      const { isLangfuseConfigured } = await import('../instrumentation');

      expect(isLangfuseConfigured()).toBe(false);
    });

    it('should return true when all required config is present', async () => {
      process.env.LANGFUSE_ENABLED = 'true';
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';

      const { isLangfuseConfigured } = await import('../instrumentation');

      expect(isLangfuseConfigured()).toBe(true);
    });

    it('should return false when enabled is not set', async () => {
      delete process.env.LANGFUSE_ENABLED;
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';

      const { isLangfuseConfigured } = await import('../instrumentation');

      expect(isLangfuseConfigured()).toBe(false);
    });
  });

  describe('initializeInstrumentation', () => {
    it('should not throw when Langfuse is not configured', async () => {
      delete process.env.LANGFUSE_ENABLED;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;

      // The import will trigger initialization - should not throw
      await expect(import('../instrumentation')).resolves.toBeDefined();
    });

    it('should not throw when Langfuse is properly configured', async () => {
      process.env.LANGFUSE_ENABLED = 'true';
      process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';
      process.env.LANGFUSE_BASEURL = 'https://cloud.langfuse.com';

      // The import will trigger initialization - should not throw
      await expect(import('../instrumentation')).resolves.toBeDefined();
    });
  });
});
