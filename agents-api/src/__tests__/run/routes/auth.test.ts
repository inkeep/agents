import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import { getAnonJwtSecret } from '../../../domains/run/routes/auth';
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
      expect(exp - iat).toBe(86400);
      expect(exp).toBeGreaterThanOrEqual(beforeRequest + 86400);
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
