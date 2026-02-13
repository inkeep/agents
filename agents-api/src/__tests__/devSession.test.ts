import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentsHono } from '../createApp';

const mockEnv = vi.hoisted(() => ({
  ENVIRONMENT: 'development' as string,
  INKEEP_AGENTS_MANAGE_UI_USERNAME: 'dev@example.com' as string | undefined,
  INKEEP_AGENTS_MANAGE_UI_PASSWORD: 'devpassword123' as string | undefined,
}));

vi.mock('../env', () => ({ env: mockEnv }));

const defaultServerConfig = { port: 3002, serverOptions: {} };
const defaultCredentialStores = { getAll: () => [], get: () => null } as any;

describe('POST /api/auth/dev-session', () => {
  beforeEach(() => {
    mockEnv.ENVIRONMENT = 'development';
    mockEnv.INKEEP_AGENTS_MANAGE_UI_USERNAME = 'dev@example.com';
    mockEnv.INKEEP_AGENTS_MANAGE_UI_PASSWORD = 'devpassword123';
  });

  it('returns 200 with Set-Cookie when ENVIRONMENT=development and credentials are configured', async () => {
    const mockAuth = {
      handler: vi.fn(async (req: Request) => {
        const body = await req.json();
        if (body.email === 'dev@example.com' && body.password === 'devpassword123') {
          return new Response(JSON.stringify({ user: { id: 'test-user' } }), {
            status: 200,
            headers: {
              'Set-Cookie': 'better-auth.session_token=test-token; Path=/; HttpOnly',
              'Content-Type': 'application/json',
            },
          });
        }
        return new Response('Unauthorized', { status: 401 });
      }),
    };

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    const res = await app.request('/api/auth/dev-session', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('better-auth.session_token');
  });

  it('returns 400 when credentials are not configured', async () => {
    mockEnv.INKEEP_AGENTS_MANAGE_UI_USERNAME = undefined;
    mockEnv.INKEEP_AGENTS_MANAGE_UI_PASSWORD = undefined;

    const mockAuth = { handler: vi.fn() };

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    const res = await app.request('/api/auth/dev-session', { method: 'POST' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Dev credentials not configured');
  });

  it('passes through auth.handler error responses (e.g. 401 for invalid credentials)', async () => {
    const mockAuth = {
      handler: vi.fn(async () => {
        return new Response(JSON.stringify({ message: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    };

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    const res = await app.request('/api/auth/dev-session', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.status).toBe(401);
  });

  it('endpoint is not registered when ENVIRONMENT is not development', async () => {
    mockEnv.ENVIRONMENT = 'production';

    const mockAuth = {
      handler: vi.fn(async () => {
        return new Response('Not Found', { status: 404 });
      }),
    };

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    const res = await app.request('/api/auth/dev-session', { method: 'POST' });

    // When ENVIRONMENT !== 'development', the dev-session route is not registered.
    // The request falls through to the catch-all auth handler which delegates to auth.handler(),
    // and auth.handler() returns 404 because there's no Better Auth route at /dev-session.
    expect(res.status).toBe(404);
  });

  it('endpoint is not registered when auth is null', async () => {
    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: null,
    });

    const res = await app.request('/api/auth/dev-session', { method: 'POST' });

    expect(res.status).toBe(404);
  });
});
