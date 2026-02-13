import { describe, expect, it, vi } from 'vitest';
import { createAgentsHono } from '../createApp';
import { env } from '../env';

describe('POST /api/auth/dev-session', () => {
  it('returns 200 with Set-Cookie when ENVIRONMENT=development and credentials are configured', async () => {
    const originalEnvironment = env.ENVIRONMENT;
    const originalUsername = env.INKEEP_AGENTS_MANAGE_UI_USERNAME;
    const originalPassword = env.INKEEP_AGENTS_MANAGE_UI_PASSWORD;

    (env as any).ENVIRONMENT = 'development';
    (env as any).INKEEP_AGENTS_MANAGE_UI_USERNAME = 'dev@example.com';
    (env as any).INKEEP_AGENTS_MANAGE_UI_PASSWORD = 'devpassword123';

    try {
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
        serverConfig: { port: 3002, serverOptions: {} },
        credentialStores: { getAll: () => [], get: () => null } as any,
        auth: mockAuth as any,
      });

      const res = await app.request('/api/auth/dev-session', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3000' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Set-Cookie')).toContain('better-auth.session_token');
    } finally {
      (env as any).ENVIRONMENT = originalEnvironment;
      (env as any).INKEEP_AGENTS_MANAGE_UI_USERNAME = originalUsername;
      (env as any).INKEEP_AGENTS_MANAGE_UI_PASSWORD = originalPassword;
    }
  });

  it('returns 400 when credentials are not configured', async () => {
    const originalEnvironment = env.ENVIRONMENT;
    const originalUsername = env.INKEEP_AGENTS_MANAGE_UI_USERNAME;
    const originalPassword = env.INKEEP_AGENTS_MANAGE_UI_PASSWORD;

    (env as any).ENVIRONMENT = 'development';
    (env as any).INKEEP_AGENTS_MANAGE_UI_USERNAME = undefined;
    (env as any).INKEEP_AGENTS_MANAGE_UI_PASSWORD = undefined;

    try {
      const mockAuth = {
        handler: vi.fn(),
      };

      const app = createAgentsHono({
        serverConfig: { port: 3002, serverOptions: {} },
        credentialStores: { getAll: () => [], get: () => null } as any,
        auth: mockAuth as any,
      });

      const res = await app.request('/api/auth/dev-session', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Dev credentials not configured');
    } finally {
      (env as any).ENVIRONMENT = originalEnvironment;
      (env as any).INKEEP_AGENTS_MANAGE_UI_USERNAME = originalUsername;
      (env as any).INKEEP_AGENTS_MANAGE_UI_PASSWORD = originalPassword;
    }
  });

  it('endpoint is not registered when ENVIRONMENT is not development', async () => {
    const originalEnvironment = env.ENVIRONMENT;
    (env as any).ENVIRONMENT = 'production';

    try {
      const mockAuth = {
        handler: vi.fn(async () => {
          return new Response('Not Found', { status: 404 });
        }),
      };

      const app = createAgentsHono({
        serverConfig: { port: 3002, serverOptions: {} },
        credentialStores: { getAll: () => [], get: () => null } as any,
        auth: mockAuth as any,
      });

      const res = await app.request('/api/auth/dev-session', {
        method: 'POST',
      });

      // When ENVIRONMENT !== 'development', the dev-session route is not registered.
      // The request falls through to the catch-all auth handler which delegates to auth.handler(),
      // and auth.handler() returns 404 because there's no Better Auth route at /dev-session.
      expect(res.status).toBe(404);
    } finally {
      (env as any).ENVIRONMENT = originalEnvironment;
    }
  });
});
