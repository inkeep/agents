import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeManagementApiRequest } from '../api-config';

const nextHeaders = vi.hoisted(() => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock('next/headers', () => nextHeaders);

describe('management API authentication', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('INKEEP_AGENTS_API_URL', 'http://agents-api.test');
    vi.stubEnv('INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET', 'configured-bypass-secret');
    vi.stubGlobal('fetch', fetchMock);

    fetchMock.mockResolvedValue(Response.json({ projects: [] }));
    nextHeaders.headers.mockResolvedValue({
      get: (name: string) =>
        name === 'cookie'
          ? 'theme=dark; better-auth.session_token=valid-session; preferences=compact'
          : null,
    });
    nextHeaders.cookies.mockResolvedValue({ getAll: () => [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('forwards the user session without adding the management bypass credential', async () => {
    await makeManagementApiRequest('tenants/test/projects');

    const request = fetchMock.mock.calls[0];
    expect(request).toBeDefined();

    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get('cookie')).toBe('better-auth.session_token=valid-session');
    expect(headers.get('authorization')).toBeNull();
  });

  it('does not elevate a request without a user session to the management bypass credential', async () => {
    nextHeaders.headers.mockResolvedValue({ get: () => null });
    nextHeaders.cookies.mockResolvedValue({ getAll: () => [] });

    await makeManagementApiRequest('tenants/test/projects');

    const request = fetchMock.mock.calls[0];
    expect(request).toBeDefined();

    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
  });
});
