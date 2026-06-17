import { beforeEach, describe, expect, it, vi } from 'vitest';

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
}));

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return { ...actual, jwtVerify: jwtVerifyMock };
});

vi.mock('@hono/mcp', () => ({
  StreamableHTTPTransport: vi.fn().mockImplementation(() => ({
    handleRequest: (c: { json: (body: unknown, status: number) => unknown }) =>
      c.json({ proceeded: true }, 200),
  })),
}));

vi.mock('@inkeep/agents-mcp', () => ({
  createConsoleLogger: () => ({ level: 'error' }),
  createMCPServer: () => ({ server: { connect: vi.fn().mockResolvedValue(undefined) } }),
  HeaderForwardingHook: vi.fn(),
  InkeepAgentsCore: vi.fn(),
  SDKHooks: vi.fn(),
}));

import mcpApp from '../../domains/mcp/routes/mcp';
import { env } from '../../env';
import { getAcceptedAudiences, getOAuthIssuer } from '../../utils/oauthJwks';
import {
  getProtectedResourceMetadata,
  mcpWwwAuthenticateHeader,
  protectedResourceMetadataUrl,
} from '../../utils/oauthProtectedResource';

const BASE = (env.INKEEP_AGENTS_API_URL || 'http://localhost:3002').replace(/\/+$/, '');
const VALID_SHAPE_JWT = 'aaaa.bbbb.cccc';

describe('protected resource metadata', () => {
  it('declares the base URL as the resource and the better-auth AS', () => {
    const metadata = getProtectedResourceMetadata();
    expect(metadata.resource).toBe(BASE);
    expect(metadata.authorization_servers).toEqual([getOAuthIssuer()]);
    expect(metadata.authorization_servers[0]).toBe(`${BASE}/api/auth`);
    expect(metadata.scopes_supported).toContain('openid');
    expect(metadata.bearer_methods_supported).toEqual(['header']);
  });

  it('accepts both the API base and the /mcp resource as audiences', () => {
    expect(getAcceptedAudiences()).toEqual([BASE, `${BASE}/`, `${BASE}/mcp`]);
  });

  it('builds an RFC 9728 WWW-Authenticate header pointing at the metadata URL', () => {
    expect(mcpWwwAuthenticateHeader()).toBe(
      `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`
    );
    const withError = mcpWwwAuthenticateHeader({ error: 'invalid_token', description: 'nope' });
    expect(withError).toContain(`resource_metadata="${protectedResourceMetadataUrl()}"`);
    expect(withError).toContain('error="invalid_token"');
    expect(withError).toContain('error_description="nope"');
  });
});

describe('/mcp OAuth resource-server gate', () => {
  beforeEach(() => {
    jwtVerifyMock.mockReset();
  });

  it('challenges an unauthenticated request with a 401 + WWW-Authenticate', async () => {
    const res = await mcpApp.request('/', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    expect(await res.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('challenges an invalid bearer JWT with error="invalid_token"', async () => {
    jwtVerifyMock.mockRejectedValueOnce(new Error('signature verification failed'));
    const res = await mcpApp.request('/', {
      method: 'POST',
      headers: { authorization: `Bearer ${VALID_SHAPE_JWT}` },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('error="invalid_token"');
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('passes a valid audience-bound bearer JWT (with tenant claim) through to the MCP transport', async () => {
    jwtVerifyMock.mockResolvedValueOnce({
      payload: { sub: 'user-1', 'https://inkeep.com/tenantId': 'tenant-1' },
    } as never);
    const res = await mcpApp.request('/', {
      method: 'POST',
      headers: { authorization: `Bearer ${VALID_SHAPE_JWT}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proceeded: true });
    expect(jwtVerifyMock).toHaveBeenCalledWith(VALID_SHAPE_JWT, expect.anything(), {
      issuer: getOAuthIssuer(),
      audience: getAcceptedAudiences(),
    });
  });

  it('challenges a verified JWT that is missing the tenant claim with error="invalid_token"', async () => {
    jwtVerifyMock.mockResolvedValueOnce({ payload: { sub: 'user-1' } } as never);
    const res = await mcpApp.request('/', {
      method: 'POST',
      headers: { authorization: `Bearer ${VALID_SHAPE_JWT}` },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('error="invalid_token"');
    expect(await res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('passes a session-cookie request through without an OAuth challenge (backward compat)', async () => {
    const res = await mcpApp.request('/', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=abc' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proceeded: true });
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('passes an x-forwarded-cookie request through without an OAuth challenge (browser compat)', async () => {
    // Browsers can't set the Cookie header directly, so the MCP route also honors
    // x-forwarded-cookie. Exercise that branch so it can't regress to a 401.
    const res = await mcpApp.request('/', {
      method: 'POST',
      headers: { 'x-forwarded-cookie': 'better-auth.session_token=abc' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proceeded: true });
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('passes a non-JWT bearer (API-key style) through without verifying it as an OAuth token', async () => {
    const res = await mcpApp.request('/', {
      method: 'POST',
      headers: { authorization: 'Bearer sk_some_api_key' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proceeded: true });
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });
});
