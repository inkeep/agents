import { trace } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn(),
  },
}));

vi.mock('../../logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('in-process-fetch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(trace.getActiveSpan).mockReset();
    delete (globalThis as any).__inkeep_appFetch;
  });

  it('should delegate to registered fetch when app is registered', async () => {
    const { registerAppFetch, getInProcessFetch } = await import('../../utils/in-process-fetch');
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok')) as unknown as typeof fetch;

    registerAppFetch(mockFetch);

    const wrappedFetch = getInProcessFetch();
    await wrappedFetch('http://localhost/test');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost/test', undefined);
  });

  it('should throw in production when not registered', async () => {
    vi.stubEnv('ENVIRONMENT', 'production');

    const { getInProcessFetch } = await import('../../utils/in-process-fetch');

    expect(() => getInProcessFetch()).toThrow('[in-process-fetch] App fetch not registered');

    vi.unstubAllEnvs();
  });

  it('should fall back to global fetch in test environment when not registered', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');

    const { getInProcessFetch } = await import('../../utils/in-process-fetch');

    expect(getInProcessFetch()).toBe(fetch);

    vi.unstubAllEnvs();
  });

  it('should return wrapped registered fetch even in test environment', async () => {
    vi.stubEnv('ENVIRONMENT', 'test');

    const { registerAppFetch, getInProcessFetch } = await import('../../utils/in-process-fetch');
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok')) as unknown as typeof fetch;

    registerAppFetch(mockFetch);

    const wrappedFetch = getInProcessFetch();
    await wrappedFetch('http://localhost/test');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost/test', undefined);

    vi.unstubAllEnvs();
  });

  it('should set http.route.in_process span attribute when active span exists', async () => {
    const mockSetAttribute = vi.fn();
    vi.mocked(trace.getActiveSpan).mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);

    const { registerAppFetch, getInProcessFetch } = await import('../../utils/in-process-fetch');
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok')) as unknown as typeof fetch;

    registerAppFetch(mockFetch);

    const wrappedFetch = getInProcessFetch();
    await wrappedFetch('http://localhost/run/test');

    expect(mockSetAttribute).toHaveBeenCalledWith('http.route.in_process', true);
  });

  it('should not throw when no active span exists', async () => {
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

    const { registerAppFetch, getInProcessFetch } = await import('../../utils/in-process-fetch');
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok')) as unknown as typeof fetch;

    registerAppFetch(mockFetch);

    const wrappedFetch = getInProcessFetch();
    await expect(wrappedFetch('http://localhost/test')).resolves.toBeDefined();
  });
});
