import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentsHono } from '../createApp';

const mockEnv = vi.hoisted(() => ({
  ENVIRONMENT: 'development' as string,
  INKEEP_AGENTS_MANAGE_UI_USERNAME: 'dev@example.com' as string | undefined,
}));

vi.mock('../env', () => ({ env: mockEnv }));

const defaultServerConfig = { port: 3002, serverOptions: {} };
const defaultCredentialStores = { getAll: () => [], get: () => null } as any;

function createMockAuth(overrides?: {
  findUserByEmail?: ReturnType<typeof vi.fn>;
  createSession?: ReturnType<typeof vi.fn>;
  secret?: string;
  sessionTokenName?: string;
  sessionTokenOptions?: Record<string, unknown>;
  expiresIn?: number;
}) {
  const findUserByEmail =
    overrides?.findUserByEmail ?? vi.fn().mockResolvedValue({ user: { id: 'user-123' } });

  const createSession =
    overrides?.createSession ??
    vi.fn().mockResolvedValue({
      id: 'session-abc',
      token: 'tok_test123',
      userId: 'user-123',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });

  const secret = overrides?.secret ?? 'test-secret-key';
  const sessionTokenName = overrides?.sessionTokenName ?? 'better-auth.session_token';
  const sessionTokenOptions = overrides?.sessionTokenOptions ?? {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false,
  };
  const expiresIn = overrides?.expiresIn ?? 604800;

  return {
    handler: vi.fn(async () => new Response('Not Found', { status: 404 })),
    $context: Promise.resolve({
      internalAdapter: { findUserByEmail, createSession },
      secret,
      authCookies: {
        sessionToken: {
          name: sessionTokenName,
          options: sessionTokenOptions,
        },
      },
      sessionConfig: { expiresIn },
    }),
  };
}

describe('POST /api/auth/dev-session', () => {
  beforeEach(() => {
    mockEnv.ENVIRONMENT = 'development';
    mockEnv.INKEEP_AGENTS_MANAGE_UI_USERNAME = 'dev@example.com';
  });

  it('returns 200 with Set-Cookie and JSON body { ok: true } when ENVIRONMENT=development and user exists', async () => {
    const mockAuth = createMockAuth();

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
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(res.headers.get('Set-Cookie')).toContain('better-auth.session_token');
  });

  it('Set-Cookie value is HMAC-SHA-256 signed in format token.base64sig (URL-encoded)', async () => {
    const secret = 'my-test-secret';
    const token = 'tok_abc123';

    const mockAuth = createMockAuth({
      secret,
      createSession: vi.fn().mockResolvedValue({
        id: 'session-abc',
        token,
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 86400 * 1000),
      }),
    });

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

    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).not.toBe('');
    const cookieValue = setCookie.split(';')[0].split('=').slice(1).join('=');
    const decoded = decodeURIComponent(cookieValue);
    const [receivedToken, receivedSig] = decoded.split('.');

    expect(receivedToken).toBe(token);

    // Verify HMAC-SHA-256 signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)));

    expect(receivedSig).toBe(expectedSig);
  });

  it('Set-Cookie includes correct attributes from authCookies and sessionConfig', async () => {
    const mockAuth = createMockAuth({
      sessionTokenOptions: {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      },
      expiresIn: 604800,
    });

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
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).not.toBe('');

    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=604800');
    expect(setCookie).not.toContain('Secure');
  });

  it('calls findUserByEmail with email from env var and createSession with returned userId', async () => {
    const findUserByEmail = vi.fn().mockResolvedValue({ user: { id: 'user-456' } });
    const createSession = vi.fn().mockResolvedValue({
      id: 'session-xyz',
      token: 'tok_xyz',
      userId: 'user-456',
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });

    const mockAuth = createMockAuth({ findUserByEmail, createSession });

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    await app.request('/api/auth/dev-session', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(findUserByEmail).toHaveBeenCalledWith('dev@example.com');
    expect(createSession).toHaveBeenCalledWith('user-456');
  });

  it('returns 400 with error mentioning "not configured" when INKEEP_AGENTS_MANAGE_UI_USERNAME is undefined', async () => {
    mockEnv.INKEEP_AGENTS_MANAGE_UI_USERNAME = undefined;

    const mockAuth = createMockAuth();

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    const res = await app.request('/api/auth/dev-session', { method: 'POST' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });

  it('returns 400 with error mentioning "not found" when findUserByEmail returns null', async () => {
    const mockAuth = createMockAuth({
      findUserByEmail: vi.fn().mockResolvedValue(null),
    });

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    const res = await app.request('/api/auth/dev-session', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('returns 404 when ENVIRONMENT is not development (falls through to catch-all auth handler)', async () => {
    mockEnv.ENVIRONMENT = 'production';

    const mockAuth = createMockAuth();

    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: mockAuth as any,
    });

    const res = await app.request('/api/auth/dev-session', { method: 'POST' });

    expect(res.status).toBe(404);
  });

  it('returns 404 when auth is null', async () => {
    const app = createAgentsHono({
      serverConfig: defaultServerConfig,
      credentialStores: defaultCredentialStores,
      auth: null,
    });

    const res = await app.request('/api/auth/dev-session', { method: 'POST' });

    expect(res.status).toBe(404);
  });
});
