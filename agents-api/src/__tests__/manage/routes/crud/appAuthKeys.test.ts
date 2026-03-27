import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

async function rsaPem() {
  const { publicKey } = await generateKeyPair('RS256');
  return exportSPKI(publicKey);
}

async function ecPem() {
  const { publicKey } = await generateKeyPair('ES256');
  return exportSPKI(publicKey);
}

describe('App Auth Keys Routes', () => {
  const createTestApp = async (tenantId: string, projectId: string) => {
    const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Auth Test App',
        type: 'web_client',
        config: {
          type: 'web_client',
          webClient: { allowedDomains: ['example.com'] },
        },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    return body.data.app;
  };

  const keysUrl = (tenantId: string, projectId: string, appId: string) =>
    `/manage/tenants/${tenantId}/projects/${projectId}/apps/${appId}/auth/keys`;

  describe('POST /auth/keys', () => {
    it('should add a public key to an app', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-add');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);
      const pem = await rsaPem();

      const res = await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'key-1', publicKey: pem, algorithm: 'RS256' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.kid).toBe('key-1');
      expect(body.data.algorithm).toBe('RS256');
      expect(body.data.addedAt).toBeDefined();
    });

    it('should reject duplicate kid', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-dup');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);
      const pem = await rsaPem();

      await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'dup-kid', publicKey: pem, algorithm: 'RS256' }),
      });

      const res = await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'dup-kid', publicKey: pem, algorithm: 'RS256' }),
      });

      expect(res.status).toBe(409);
    });

    it('should reject a private key', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-privkey');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);

      const { privateKey } = await generateKeyPair('RS256', { extractable: true });
      const pem = await exportPKCS8(privateKey);

      const res = await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'priv-key', publicKey: pem, algorithm: 'RS256' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.detail).toContain('private key');
    });

    it('should reject key with mismatched algorithm', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-mismatch');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);

      const ecKey = await ecPem();

      const res = await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'mismatch', publicKey: ecKey, algorithm: 'RS256' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for api app type', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-api-app');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const createRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'API App',
            type: 'api',
            config: { type: 'api', api: {} },
          }),
        }
      );
      const apiApp = (await createRes.json()).data.app;

      const pem = await rsaPem();
      const res = await makeRequest(keysUrl(tenantId, projectId, apiApp.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'key-1', publicKey: pem, algorithm: 'RS256' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent app', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-404-post');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const pem = await rsaPem();
      const res = await makeRequest(keysUrl(tenantId, projectId, 'nonexistent-app'), {
        method: 'POST',
        body: JSON.stringify({ kid: 'key-1', publicKey: pem, algorithm: 'RS256' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /auth/keys', () => {
    it('should list keys on an app', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-list');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);

      const pem1 = await rsaPem();
      const pem2 = await ecPem();
      await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'rsa-key', publicKey: pem1, algorithm: 'RS256' }),
      });
      await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'ec-key', publicKey: pem2, algorithm: 'ES256' }),
      });

      const res = await makeRequest(keysUrl(tenantId, projectId, app.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.map((k: { kid: string }) => k.kid).sort()).toEqual(['ec-key', 'rsa-key']);
    });

    it('should return empty array when no keys configured', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);

      const res = await makeRequest(keysUrl(tenantId, projectId, app.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe('DELETE /auth/keys/:kid', () => {
    it('should delete a key by kid', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-delete');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);

      const pem = await rsaPem();
      await makeRequest(keysUrl(tenantId, projectId, app.id), {
        method: 'POST',
        body: JSON.stringify({ kid: 'to-delete', publicKey: pem, algorithm: 'RS256' }),
      });

      const deleteRes = await makeRequest(`${keysUrl(tenantId, projectId, app.id)}/to-delete`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(204);

      const listRes = await makeRequest(keysUrl(tenantId, projectId, app.id));
      const body = await listRes.json();
      expect(body.data).toEqual([]);
    });

    it('should return 404 for non-existent kid', async () => {
      const tenantId = await createTestTenantWithOrg('auth-keys-delete-404');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);
      const app = await createTestApp(tenantId, projectId);

      const res = await makeRequest(`${keysUrl(tenantId, projectId, app.id)}/nonexistent`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });
});
