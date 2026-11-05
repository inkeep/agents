import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';
import * as authSchema from '../auth-schema';

vi.mock('../authz/sync', () => ({
  grantProjectAccess: vi.fn().mockResolvedValue(undefined),
  syncOrgMemberToSpiceDb: vi.fn().mockResolvedValue(undefined),
}));

const BASE_URL = 'http://localhost:3002';
const REDIRECT_URI = 'http://127.0.0.1:43123/callback';
const MCP_RESOURCE = `${BASE_URL}/mcp`;
const AGENTS_API_ISSUER = `${BASE_URL}/api/auth`;
const AGENTS_API_AUDIENCES = [BASE_URL, `${BASE_URL}/`, MCP_RESOURCE];

function makeAuth() {
  return createAuth({
    baseURL: BASE_URL,
    secret: 'test-secret-test-secret-test-secret',
    dbClient: testRunDbClient,
    disablePasswordCompromiseCheck: true,
  });
}

async function signUp(auth: ReturnType<typeof createAuth>) {
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'mcp-user@example.com',
        password: 'A-sufficiently-long-password-1!',
        name: 'MCP User',
      }),
    })
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function registerPublicClient(auth: ReturnType<typeof createAuth>) {
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Example MCP client',
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    })
  );
  expect(response.status).toBeLessThan(300);
  const body = (await response.json()) as { client_id: string };
  return body.client_id;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function tokenRequest(auth: ReturnType<typeof createAuth>, params: Record<string, string>) {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })
  );
}

async function seedClientAsStoredBefore17(clientId: string) {
  const now = new Date();
  await testRunDbClient.insert(authSchema.oauthClient).values({
    id: `${clientId}-row`,
    clientId,
    disabled: false,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    createdAt: now,
    updatedAt: now,
    name: 'Claude Code (example)',
    redirectUris: [REDIRECT_URI],
    tokenEndpointAuthMethod: 'none',
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    public: true,
  });
}

async function verifyLikeAgentsApi(auth: ReturnType<typeof createAuth>, token: string) {
  const jwksResponse = await auth.handler(new Request(`${BASE_URL}/api/auth/jwks`));
  expect(jwksResponse.status).toBe(200);
  const jwks = createLocalJWKSet((await jwksResponse.json()) as JSONWebKeySet);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: AGENTS_API_ISSUER,
    audience: AGENTS_API_AUDIENCES,
  });
  return payload;
}

async function runMcpAuthorizationFlow(auth: ReturnType<typeof createAuth>, clientId: string) {
  const cookie = await signUp(auth);
  const { verifier, challenge } = pkce();

  const authorizeUrl = new URL(`${BASE_URL}/api/auth/oauth2/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    state: 'example-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: MCP_RESOURCE,
  }).toString();
  const authorize = await auth.handler(
    new Request(authorizeUrl, { headers: { cookie }, redirect: 'manual' })
  );
  const consentLocation = authorize.headers.get('location') ?? '';
  expect(consentLocation).toContain('/consent');
  expect(consentLocation).not.toContain('invalid_target');

  const consent = await auth.handler(
    new Request(`${BASE_URL}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        accept: true,
        oauth_query: new URL(consentLocation).searchParams.toString(),
      }),
    })
  );
  expect(consent.status).toBe(200);
  const { url } = (await consent.json()) as { url: string };
  const code = new URL(url).searchParams.get('code');
  expect(code).toBeTruthy();

  const token = await tokenRequest(auth, {
    grant_type: 'authorization_code',
    code: code ?? '',
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
    resource: MCP_RESOURCE,
  });
  expect(token.status).toBe(200);
  const tokens = (await token.json()) as { access_token: string; refresh_token: string };
  expect((await verifyLikeAgentsApi(auth, tokens.access_token)).aud).toContain(MCP_RESOURCE);
  expect(tokens.refresh_token).toBeTruthy();

  const refreshed = await tokenRequest(auth, {
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: clientId,
    resource: MCP_RESOURCE,
  });
  expect(refreshed.status).toBe(200);
  const refreshedTokens = (await refreshed.json()) as { access_token: string };
  expect((await verifyLikeAgentsApi(auth, refreshedTokens.access_token)).aud).toContain(
    MCP_RESOURCE
  );
}

describe('MCP client OAuth flow with an RFC 8707 resource', () => {
  it('lets a public client that registers a loopback redirect without application_type get and refresh a /mcp token', async () => {
    const auth = makeAuth();
    const clientId = await registerPublicClient(auth);
    await runMcpAuthorizationFlow(auth, clientId);
  });

  it('keeps working for a client registered before 1.7, which has no application_type or resource link', async () => {
    const auth = makeAuth();
    await seedClientAsStoredBefore17('pre-17-public-client');
    await runMcpAuthorizationFlow(auth, 'pre-17-public-client');
  });
});
