import {
  filterAuthCookieHeader,
  requireApiRouteProjectPermission,
  requireApiRouteSession,
  requireApiRouteSessionOrBearer,
} from '../api-route-auth';

vi.mock('@/lib/api/api-config', () => ({
  getAgentsApiUrl: () => 'http://agents-api.test',
}));

describe('api-route-auth', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters auth cookies from the raw cookie header', () => {
    expect(
      filterAuthCookieHeader(
        'theme=dark; better-auth.session_token=abc; __Secure-better-auth.session_data=def; foo=bar'
      )
    ).toBe('better-auth.session_token=abc; __Secure-better-auth.session_data=def');
  });

  it('rejects requests without auth cookies before contacting agents-api', async () => {
    const result = await requireApiRouteSession(new Request('http://localhost/api/test'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts requests with a valid Better Auth session', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        session: { id: 'session-1' },
        user: { id: 'user-1', email: 'user@example.com' },
      })
    );

    const result = await requireApiRouteSession(
      new Request('http://localhost/api/test', {
        headers: {
          cookie:
            'theme=dark; better-auth.session_token=abc; __Secure-better-auth.session_data=def',
        },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cookieHeader).toBe(
        'better-auth.session_token=abc; __Secure-better-auth.session_data=def'
      );
      expect(result.session.user.id).toBe('user-1');
    }

    expect(fetchMock).toHaveBeenCalledWith('http://agents-api.test/api/auth/get-session', {
      headers: {
        cookie: 'better-auth.session_token=abc; __Secure-better-auth.session_data=def',
      },
      cache: 'no-store',
    });
  });

  it('accepts bearer-authenticated requests without fetching the session', async () => {
    const result = await requireApiRouteSessionOrBearer(
      new Request('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer test-bypass-secret',
        },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authType).toBe('bearer');
      expect(result.authorizationHeader).toBe('Bearer test-bypass-secret');
      expect(result.headers).toEqual({
        Authorization: 'Bearer test-bypass-secret',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers bearer auth over cookies when both are present', async () => {
    const result = await requireApiRouteSessionOrBearer(
      new Request('http://localhost/api/test', {
        headers: {
          authorization: 'Bearer test-bypass-secret',
          cookie: 'better-auth.session_token=abc',
        },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authType).toBe('bearer');
      expect(result.headers).toEqual({
        Authorization: 'Bearer test-bypass-secret',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to session auth when no bearer token is provided', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        session: { id: 'session-1' },
        user: { id: 'user-1', email: 'user@example.com' },
      })
    );

    const result = await requireApiRouteSessionOrBearer(
      new Request('http://localhost/api/test', {
        headers: {
          cookie:
            'theme=dark; better-auth.session_token=abc; __Secure-better-auth.session_data=def',
        },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authType).toBe('session');
      expect(result.cookieHeader).toBe(
        'better-auth.session_token=abc; __Secure-better-auth.session_data=def'
      );
      expect(result.headers).toEqual({
        Cookie: 'better-auth.session_token=abc; __Secure-better-auth.session_data=def',
      });
      expect(result.session?.user.id).toBe('user-1');
    }

    expect(fetchMock).toHaveBeenCalledWith('http://agents-api.test/api/auth/get-session', {
      headers: {
        cookie: 'better-auth.session_token=abc; __Secure-better-auth.session_data=def',
      },
      cache: 'no-store',
    });
  });

  it('rejects project-scoped requests when the user lacks the required permission', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          session: { id: 'session-1' },
          user: { id: 'user-1', email: 'user@example.com' },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            canView: true,
            canUse: true,
            canEdit: false,
          },
        })
      );

    const result = await requireApiRouteProjectPermission(
      new Request('http://localhost/api/test', {
        headers: {
          cookie: 'better-auth.session_token=abc',
        },
      }),
      {
        tenantId: 'tenant-1',
        projectId: 'project-1',
        level: 'edit',
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://agents-api.test/manage/tenants/tenant-1/projects/project-1/permissions',
      {
        headers: {
          cookie: 'better-auth.session_token=abc',
        },
        cache: 'no-store',
      }
    );
  });

  it('returns null for filterAuthCookieHeader with null input', () => {
    expect(filterAuthCookieHeader(null)).toBe(null);
  });

  it('returns null when no auth cookies present', () => {
    expect(filterAuthCookieHeader('theme=dark; foo=bar')).toBe(null);
  });

  it('handles session service errors gracefully', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 500 }));
    const result = await requireApiRouteSession(
      new Request('http://localhost/api/test', {
        headers: { cookie: 'better-auth.session_token=abc' },
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });

  it('accepts project-scoped requests when user has permission', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ session: { id: 's' }, user: { id: 'u' } }))
      .mockResolvedValueOnce(
        Response.json({ data: { canView: true, canUse: true, canEdit: true } })
      );
    const result = await requireApiRouteProjectPermission(
      new Request('http://localhost', { headers: { cookie: 'better-auth.session_token=abc' } }),
      { tenantId: 't', projectId: 'p', level: 'edit' }
    );
    expect(result.ok).toBe(true);
  });
});
