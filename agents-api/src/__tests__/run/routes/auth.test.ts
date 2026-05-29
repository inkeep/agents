import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { jwtVerify, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import { getAnonJwtSecret } from '../../../domains/run/routes/auth';
import { env } from '../../../env';
import app from '../../../index';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantWithOrg } from '../../utils/testTenant';

const createTestWebClientApp = async ({
  tenantId,
  projectId,
  allowedDomains = ['help.customer.com'],
  allowAnonymous = true,
  enabled = true,
}: {
  tenantId: string;
  projectId: string;
  allowedDomains?: string[];
  allowAnonymous?: boolean;
  enabled?: boolean;
}) => {
  const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Web Client',
      type: 'web_client',
      enabled,
      config: {
        type: 'web_client',
        webClient: {
          allowedDomains,
          allowAnonymous,
        },
      },
    }),
  });

  expect(createRes.status).toBe(201);
  const body = await createRes.json();
  return body.data.app;
};

const createTestApiApp = async ({
  tenantId,
  projectId,
}: {
  tenantId: string;
  projectId: string;
}) => {
  const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test API App',
      type: 'api',
      config: { type: 'api', api: {} },
    }),
  });

  expect(createRes.status).toBe(201);
  const body = await createRes.json();
  return body.data.app;
};

describe('Anonymous Session Endpoint', () => {
  let originalSentinelKeyId: string | undefined;
  let originalSentinelKeySecret: string | undefined;
  let originalSentinelBaseUrl: string | undefined;
  let originalSentinelV1KeyId: string | undefined;
  let originalSentinelV1KeySecret: string | undefined;

  beforeEach(() => {
    originalSentinelKeyId = env.INKEEP_SENTINEL_API_KEY_ID;
    originalSentinelKeySecret = env.INKEEP_SENTINEL_API_KEY_SECRET;
    originalSentinelBaseUrl = env.INKEEP_SENTINEL_BASE_URL;
    originalSentinelV1KeyId = env.INKEEP_SENTINEL_V1_API_KEY_ID;
    originalSentinelV1KeySecret = env.INKEEP_SENTINEL_V1_API_KEY_SECRET;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_ID = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_SECRET = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_BASE_URL = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_ID = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_SECRET = undefined;
  });

  afterEach(() => {
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_ID = originalSentinelKeyId;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_SECRET = originalSentinelKeySecret;
    (env as Record<string, unknown>).INKEEP_SENTINEL_BASE_URL = originalSentinelBaseUrl;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_ID = originalSentinelV1KeyId;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_SECRET =
      originalSentinelV1KeySecret;
  });

  describe('POST /run/auth/apps/{appId}/anonymous-session', () => {
    it('should issue anonymous JWT for a valid web_client app', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-valid');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.expiresAt).toBeDefined();

      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(body.token, secret, {
        issuer: 'inkeep',
        algorithms: ['HS256'],
      });

      expect(payload.sub).toMatch(/^anon_/);
      expect(payload.tid).toBe(tenantId);
      expect(payload.pid).toBe(projectId);
      expect(payload.app).toBe(appId);
      expect(payload.type).toBe('anonymous');
      expect(payload.iss).toBe('inkeep');
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
    });

    it('should use system-level session lifetime in expiry', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-lifetime');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const beforeRequest = Math.floor(Date.now() / 1000);

      const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      const secret = getAnonJwtSecret();
      const { payload } = await jwtVerify(body.token, secret, {
        issuer: 'inkeep',
        algorithms: ['HS256'],
      });

      const exp = payload.exp as number;
      const iat = payload.iat as number;
      expect(exp - iat).toBe(env.INKEEP_ANON_SESSION_LIFETIME_SECONDS);
      expect(exp).toBeGreaterThanOrEqual(beforeRequest + env.INKEEP_ANON_SESSION_LIFETIME_SECONDS);
    });

    it('should return 404 for non-existent app ID', async () => {
      const res = await app.request('/run/auth/apps/invalid-format/anonymous-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent app', async () => {
      const res = await app.request('/run/auth/apps/app_abcdef123456/anonymous-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 for disabled app', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-disabled');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({
        tenantId,
        projectId,
        enabled: false,
      });
      const appId = appRecord.id;

      const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(404);
    });

    it('should return 400 for API-type app', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-api-type');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestApiApp({ tenantId, projectId });
      const appId = appRecord.id;

      const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(400);
    });

    it('should return 403 for disallowed origin', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-bad-origin');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.attacker.com',
        },
      });

      expect(res.status).toBe(403);
    });

    it('should return 403 when no Origin header is provided', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-no-origin');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(res.status).toBe(403);
    });

    it('should support wildcard domain matching', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-wildcard');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({
        tenantId,
        projectId,
        allowedDomains: ['*.customer.com'],
      });
      const appId = appRecord.id;

      const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://docs.customer.com',
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
    });

    it('should generate unique anonymous user IDs', async () => {
      const tenantId = await createTestTenantWithOrg('anon-session-unique');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const appRecord = await createTestWebClientApp({ tenantId, projectId });
      const appId = appRecord.id;

      const secret = getAnonJwtSecret();
      const subs: string[] = [];

      for (let i = 0; i < 3; i++) {
        const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://help.customer.com',
          },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        const { payload } = await jwtVerify(body.token, secret, {
          issuer: 'inkeep',
          algorithms: ['HS256'],
        });
        subs.push(payload.sub as string);
      }

      const uniqueSubs = new Set(subs);
      expect(uniqueSubs.size).toBe(3);
    });
  });
});

describe('Anonymous Session — allowAnonymous enforcement', () => {
  let originalSentinelKeyId: string | undefined;
  let originalSentinelKeySecret: string | undefined;
  let originalSentinelBaseUrl: string | undefined;
  let originalSentinelV1KeyId: string | undefined;
  let originalSentinelV1KeySecret: string | undefined;

  beforeEach(() => {
    originalSentinelKeyId = env.INKEEP_SENTINEL_API_KEY_ID;
    originalSentinelKeySecret = env.INKEEP_SENTINEL_API_KEY_SECRET;
    originalSentinelBaseUrl = env.INKEEP_SENTINEL_BASE_URL;
    originalSentinelV1KeyId = env.INKEEP_SENTINEL_V1_API_KEY_ID;
    originalSentinelV1KeySecret = env.INKEEP_SENTINEL_V1_API_KEY_SECRET;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_ID = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_SECRET = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_BASE_URL = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_ID = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_SECRET = undefined;
  });

  afterEach(() => {
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_ID = originalSentinelKeyId;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_SECRET = originalSentinelKeySecret;
    (env as Record<string, unknown>).INKEEP_SENTINEL_BASE_URL = originalSentinelBaseUrl;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_ID = originalSentinelV1KeyId;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_SECRET =
      originalSentinelV1KeySecret;
  });

  const setAllowAnonymous = async (
    tenantId: string,
    projectId: string,
    appId: string,
    allowAnonymous: boolean
  ) => {
    const res = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/apps/${appId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          config: {
            type: 'web_client',
            webClient: {
              allowedDomains: ['help.customer.com'],
              allowAnonymous,
            },
          },
        }),
      }
    );
    expect(res.status).toBe(200);
  };

  it('should reject anonymous session when allowAnonymous is false', async () => {
    const tenantId = await createTestTenantWithOrg('anon-enforce-reject');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });

    await setAllowAnonymous(tenantId, projectId, appRecord.id, false);

    const res = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toContain('Anonymous sessions are disabled');
  });

  it('should allow anonymous session when allowAnonymous is true', async () => {
    const tenantId = await createTestTenantWithOrg('anon-enforce-allow');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });

    await setAllowAnonymous(tenantId, projectId, appRecord.id, true);

    const res = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
  });

  it('should reject anonymous session by default (allowAnonymous defaults to false)', async () => {
    const tenantId = await createTestTenantWithOrg('anon-enforce-default');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId, allowAnonymous: false });

    const res = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toContain('Anonymous sessions are disabled');
  });

  it('should reject then allow after toggling allowAnonymous back to true', async () => {
    const tenantId = await createTestTenantWithOrg('anon-enforce-toggle');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });

    await setAllowAnonymous(tenantId, projectId, appRecord.id, false);

    const rejectRes = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });
    expect(rejectRes.status).toBe(401);

    await setAllowAnonymous(tenantId, projectId, appRecord.id, true);

    const allowRes = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });
    expect(allowRes.status).toBe(200);
    const body = await allowRes.json();
    expect(body.token).toBeDefined();
  });
});

describe('Anonymous Session Rolling Refresh', () => {
  let originalSentinelKeyId: string | undefined;
  let originalSentinelKeySecret: string | undefined;
  let originalSentinelBaseUrl: string | undefined;
  let originalSentinelV1KeyId: string | undefined;
  let originalSentinelV1KeySecret: string | undefined;

  beforeEach(() => {
    originalSentinelKeyId = env.INKEEP_SENTINEL_API_KEY_ID;
    originalSentinelKeySecret = env.INKEEP_SENTINEL_API_KEY_SECRET;
    originalSentinelBaseUrl = env.INKEEP_SENTINEL_BASE_URL;
    originalSentinelV1KeyId = env.INKEEP_SENTINEL_V1_API_KEY_ID;
    originalSentinelV1KeySecret = env.INKEEP_SENTINEL_V1_API_KEY_SECRET;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_ID = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_SECRET = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_BASE_URL = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_ID = undefined;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_SECRET = undefined;
  });

  afterEach(() => {
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_ID = originalSentinelKeyId;
    (env as Record<string, unknown>).INKEEP_SENTINEL_API_KEY_SECRET = originalSentinelKeySecret;
    (env as Record<string, unknown>).INKEEP_SENTINEL_BASE_URL = originalSentinelBaseUrl;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_ID = originalSentinelV1KeyId;
    (env as Record<string, unknown>).INKEEP_SENTINEL_V1_API_KEY_SECRET =
      originalSentinelV1KeySecret;
  });

  it('should preserve anonymous identity when valid Bearer token is provided', async () => {
    const tenantId = await createTestTenantWithOrg('anon-refresh-valid');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });
    const appId = appRecord.id;

    const firstRes = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });
    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();
    const firstToken = firstBody.token;

    const secret = getAnonJwtSecret();
    const { payload: firstPayload } = await jwtVerify(firstToken, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });

    const refreshRes = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
        Authorization: `Bearer ${firstToken}`,
      },
    });
    expect(refreshRes.status).toBe(200);
    const refreshBody = await refreshRes.json();

    const { payload: refreshPayload } = await jwtVerify(refreshBody.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });

    expect(refreshPayload.sub).toBe(firstPayload.sub);
    expect(refreshPayload.tid).toBe(tenantId);
    expect(refreshPayload.pid).toBe(projectId);
    expect(refreshPayload.app).toBe(appId);
    expect(typeof refreshPayload.iat).toBe('number');
    expect(refreshPayload.iat).toBeGreaterThanOrEqual(firstPayload.iat as number);
    expect((refreshPayload.exp as number) - (refreshPayload.iat as number)).toBe(
      env.INKEEP_ANON_SESSION_LIFETIME_SECONDS
    );
  });

  it('should create new identity when no Bearer token is provided', async () => {
    const tenantId = await createTestTenantWithOrg('anon-refresh-no-bearer');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });
    const appId = appRecord.id;
    const secret = getAnonJwtSecret();

    const res1 = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });
    const body1 = await res1.json();
    const { payload: p1 } = await jwtVerify(body1.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });

    const res2 = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
      },
    });
    const body2 = await res2.json();
    const { payload: p2 } = await jwtVerify(body2.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });

    expect(p1.sub).not.toBe(p2.sub);
  });

  it('should create new identity when expired Bearer token is provided', async () => {
    const tenantId = await createTestTenantWithOrg('anon-refresh-expired');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });
    const appId = appRecord.id;
    const secret = getAnonJwtSecret();

    const expiredToken = await new SignJWT({
      tid: tenantId,
      pid: projectId,
      app: appId,
      type: 'anonymous',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('anon_expired-user')
      .setIssuer('inkeep')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);

    const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
        Authorization: `Bearer ${expiredToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const { payload } = await jwtVerify(body.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });
    expect(payload.sub).not.toBe('anon_expired-user');
    expect(payload.sub).toMatch(/^anon_/);
  });

  it('should create new identity when Bearer token is for a different app', async () => {
    const tenantId = await createTestTenantWithOrg('anon-refresh-wrong-app');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });
    const appId = appRecord.id;
    const secret = getAnonJwtSecret();

    const wrongAppToken = await new SignJWT({
      tid: tenantId,
      pid: projectId,
      app: 'app_different_app_id',
      type: 'anonymous',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('anon_wrong-app-user')
      .setIssuer('inkeep')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
        Authorization: `Bearer ${wrongAppToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const { payload } = await jwtVerify(body.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });
    expect(payload.sub).not.toBe('anon_wrong-app-user');
    expect(payload.sub).toMatch(/^anon_/);
  });

  it('should create new identity when Bearer token type is not anonymous', async () => {
    const tenantId = await createTestTenantWithOrg('anon-refresh-non-anon-type');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });
    const appId = appRecord.id;
    const secret = getAnonJwtSecret();

    const serviceToken = await new SignJWT({
      tid: tenantId,
      pid: projectId,
      app: appId,
      type: 'service',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('anon_should-not-be-reused')
      .setIssuer('inkeep')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
        Authorization: `Bearer ${serviceToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const { payload } = await jwtVerify(body.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });
    expect(payload.sub).not.toBe('anon_should-not-be-reused');
    expect(payload.sub).toMatch(/^anon_/);
    expect(payload.type).toBe('anonymous');
  });

  it('should create new identity when Bearer token sub does not have anon_ prefix', async () => {
    const tenantId = await createTestTenantWithOrg('anon-refresh-bad-sub');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });
    const appId = appRecord.id;
    const secret = getAnonJwtSecret();

    const badSubToken = await new SignJWT({
      tid: tenantId,
      pid: projectId,
      app: appId,
      type: 'anonymous',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('user_not-anonymous')
      .setIssuer('inkeep')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
        Authorization: `Bearer ${badSubToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const { payload } = await jwtVerify(body.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });
    expect(payload.sub).not.toBe('user_not-anonymous');
    expect(payload.sub).toMatch(/^anon_/);
  });

  it('should create new identity when Bearer token has invalid signature', async () => {
    const tenantId = await createTestTenantWithOrg('anon-refresh-bad-sig');
    const projectId = 'default-project';
    await createTestProject(manageDbClient, tenantId, projectId);
    const appRecord = await createTestWebClientApp({ tenantId, projectId });
    const appId = appRecord.id;
    const secret = getAnonJwtSecret();

    const wrongSecret = new TextEncoder().encode('wrong-secret-that-is-long-enough-for-hs256');
    const badToken = await new SignJWT({
      tid: tenantId,
      pid: projectId,
      app: appId,
      type: 'anonymous',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('anon_bad-sig-user')
      .setIssuer('inkeep')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(wrongSecret);

    const res = await app.request(`/run/auth/apps/${appId}/anonymous-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://help.customer.com',
        Authorization: `Bearer ${badToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const { payload } = await jwtVerify(body.token, secret, {
      issuer: 'inkeep',
      algorithms: ['HS256'],
    });
    expect(payload.sub).not.toBe('anon_bad-sig-user');
    expect(payload.sub).toMatch(/^anon_/);
  });
});
