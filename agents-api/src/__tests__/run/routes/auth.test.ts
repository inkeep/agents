import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { jwtVerify } from 'jose';
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
  enabled = true,
}: {
  tenantId: string;
  projectId: string;
  allowedDomains?: string[];
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
  let originalPowSecret: string | undefined;

  beforeEach(() => {
    originalPowSecret = env.INKEEP_POW_HMAC_SECRET;
    (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = undefined;
  });

  afterEach(() => {
    (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = originalPowSecret;
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

const TEST_POW_SECRET = 'test-pow-hmac-secret-that-is-at-least-32-characters-long';

describe('Anonymous Session PoW Enforcement', () => {
  describe('POST /run/auth/apps/{appId}/anonymous-session with PoW', () => {
    let originalSecret: string | undefined;

    beforeEach(() => {
      originalSecret = env.INKEEP_POW_HMAC_SECRET;
    });

    afterEach(() => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = originalSecret;
    });

    it('should succeed when PoW is disabled (no HMAC secret)', async () => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = undefined;

      const tenantId = await createTestTenantWithOrg('anon-pow-disabled');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const appRecord = await createTestWebClientApp({ tenantId, projectId });

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

    it('should return 400 with human-readable message when PoW header is missing', async () => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = TEST_POW_SECRET;

      const tenantId = await createTestTenantWithOrg('anon-pow-required');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const appRecord = await createTestWebClientApp({ tenantId, projectId });

      const res = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toBe('Proof-of-work challenge solution is required.');
    });

    it('should return 400 with human-readable message when PoW solution is invalid', async () => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = TEST_POW_SECRET;

      const tenantId = await createTestTenantWithOrg('anon-pow-invalid');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const appRecord = await createTestWebClientApp({ tenantId, projectId });

      const res = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
          'X-Inkeep-Challenge-Solution': 'invalid-base64-garbage',
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toBe('Proof-of-work challenge solution is invalid.');
    });

    it('should return 400 with expiry message when PoW solution is expired', async () => {
      const { createChallenge, solveChallenge } = await import('altcha-lib');

      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = TEST_POW_SECRET;

      const tenantId = await createTestTenantWithOrg('anon-pow-expired');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const appRecord = await createTestWebClientApp({ tenantId, projectId });

      const challenge = await createChallenge({
        hmacKey: TEST_POW_SECRET,
        algorithm: 'SHA-256',
        maxnumber: 1000,
        expires: new Date(Date.now() - 1000),
      });

      const { promise: solutionPromise } = solveChallenge(
        challenge.challenge,
        challenge.salt,
        challenge.algorithm,
        challenge.maxnumber
      );
      const solution = await solutionPromise;

      const payload = btoa(
        JSON.stringify({
          algorithm: challenge.algorithm,
          challenge: challenge.challenge,
          number: solution?.number,
          salt: challenge.salt,
          signature: challenge.signature,
        })
      );

      const res = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
          'X-Inkeep-Challenge-Solution': payload,
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toBe(
        'Proof-of-work challenge has expired. Please request a new challenge.'
      );
    });

    it('should succeed with valid PoW solution', async () => {
      const { createChallenge, solveChallenge } = await import('altcha-lib');

      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = TEST_POW_SECRET;

      const tenantId = await createTestTenantWithOrg('anon-pow-valid');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const appRecord = await createTestWebClientApp({ tenantId, projectId });

      const challenge = await createChallenge({
        hmacKey: TEST_POW_SECRET,
        algorithm: 'SHA-256',
        maxnumber: 1000,
        expires: new Date(Date.now() + 300_000),
      });

      const { promise: solutionPromise } = solveChallenge(
        challenge.challenge,
        challenge.salt,
        challenge.algorithm,
        challenge.maxnumber
      );
      const solution = await solutionPromise;

      const payload = btoa(
        JSON.stringify({
          algorithm: challenge.algorithm,
          challenge: challenge.challenge,
          number: solution?.number,
          salt: challenge.salt,
          signature: challenge.signature,
        })
      );

      const res = await app.request(`/run/auth/apps/${appRecord.id}/anonymous-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://help.customer.com',
          'X-Inkeep-Challenge-Solution': payload,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.expiresAt).toBeDefined();
    });
  });
});

describe('PoW Challenge Endpoint', () => {
  describe('GET /run/auth/pow/challenge', () => {
    let originalSecret: string | undefined;

    beforeEach(() => {
      originalSecret = env.INKEEP_POW_HMAC_SECRET;
    });

    afterEach(() => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = originalSecret;
    });

    it('should return 404 when PoW is disabled', async () => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = undefined;

      const res = await app.request('/run/auth/pow/challenge', { method: 'GET' });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('PoW is not enabled');
    });

    it('should return a valid challenge when PoW is enabled', async () => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = TEST_POW_SECRET;

      const res = await app.request('/run/auth/pow/challenge', { method: 'GET' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.algorithm).toBe('SHA-256');
      expect(body.challenge).toBeDefined();
      expect(typeof body.challenge).toBe('string');
      expect(body.maxnumber).toBeDefined();
      expect(typeof body.maxnumber).toBe('number');
      expect(body.salt).toBeDefined();
      expect(typeof body.salt).toBe('string');
      expect(body.signature).toBeDefined();
      expect(typeof body.signature).toBe('string');
    });

    it('should return challenges with expires encoded in salt', async () => {
      (env as Record<string, unknown>).INKEEP_POW_HMAC_SECRET = TEST_POW_SECRET;

      const res = await app.request('/run/auth/pow/challenge', { method: 'GET' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.salt).toContain('expires=');
    });
  });
});
