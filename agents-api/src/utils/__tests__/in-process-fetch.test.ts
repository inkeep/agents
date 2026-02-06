import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('in-process-fetch', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return registered fetch when app is registered', async () => {
    const { registerAppFetch, getInProcessFetch } = await import('../in-process-fetch');
    const mockFetch = vi.fn() as unknown as typeof fetch;

    registerAppFetch(mockFetch);

    expect(getInProcessFetch()).toBe(mockFetch);
  });

  it('should throw in production when not registered', async () => {
    vi.stubEnv('ENVIRONMENT', 'production');

    const { getInProcessFetch } = await import('../in-process-fetch');

    expect(() => getInProcessFetch()).toThrow('[in-process-fetch] App fetch not registered');

    vi.unstubAllEnvs();
  });

  it('should fall back to global fetch in test environment when not registered', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');

    const { getInProcessFetch } = await import('../in-process-fetch');

    expect(getInProcessFetch()).toBe(fetch);

    vi.unstubAllEnvs();
  });

  it('should return registered fetch even in test environment', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');

    const { registerAppFetch, getInProcessFetch } = await import('../in-process-fetch');
    const mockFetch = vi.fn() as unknown as typeof fetch;

    registerAppFetch(mockFetch);

    expect(getInProcessFetch()).toBe(mockFetch);

    vi.unstubAllEnvs();
  });
});
