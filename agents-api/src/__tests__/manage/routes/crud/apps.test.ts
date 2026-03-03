import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('App CRUD Routes - Integration Tests', () => {
  const createTestApp = async ({
    tenantId,
    projectId = 'default-project',
    type = 'web_client' as const,
    name = 'Test App',
  }: {
    tenantId: string;
    projectId?: string;
    type?: 'web_client' | 'api';
    name?: string;
  }) => {
    const body: Record<string, unknown> =
      type === 'web_client'
        ? {
            name,
            type: 'web_client',
            agentAccessMode: 'selected',
            allowedAgentIds: ['agent-1'],
            config: {
              type: 'web_client',
              webClient: {
                allowedDomains: ['help.customer.com'],
                authMode: 'anonymous_only',
                anonymousSessionLifetimeSeconds: 86400,
                hs256Enabled: false,
                captchaEnabled: false,
              },
            },
          }
        : {
            name,
            type: 'api',
            agentAccessMode: 'all',
            config: { type: 'api', api: {} },
          };

    const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return {
      app: createBody.data.app,
      appSecret: createBody.data.appSecret,
    };
  };

  describe('POST /', () => {
    it('should create a web_client app', async () => {
      const tenantId = await createTestTenantWithOrg('apps-create-web');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app, appSecret } = await createTestApp({ tenantId, projectId });

      expect(app.type).toBe('web_client');
      expect(app.name).toBe('Test App');
      expect(app.publicId).toBeDefined();
      expect(app.publicId).toHaveLength(12);
      expect(app.enabled).toBe(true);
      expect(app.config.type).toBe('web_client');
      expect(app.config.webClient.allowedDomains).toEqual(['help.customer.com']);
      expect(appSecret).toBeUndefined();
      expect(app).not.toHaveProperty('keyHash');
      expect(app).not.toHaveProperty('tenantId');
      expect(app).not.toHaveProperty('projectId');
    });

    it('should create an api app with secret', async () => {
      const tenantId = await createTestTenantWithOrg('apps-create-api');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app, appSecret } = await createTestApp({
        tenantId,
        projectId,
        type: 'api',
        name: 'Backend API',
      });

      expect(app.type).toBe('api');
      expect(app.name).toBe('Backend API');
      expect(appSecret).toBeDefined();
      expect(appSecret).toMatch(/^as_[^.]+\..+$/);
      expect(app.keyPrefix).toBeDefined();
    });
  });

  describe('GET /', () => {
    it('should list apps with pagination', async () => {
      const tenantId = await createTestTenantWithOrg('apps-list');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      await createTestApp({ tenantId, projectId });
      await createTestApp({ tenantId, projectId, type: 'api', name: 'API App' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it('should filter by type', async () => {
      const tenantId = await createTestTenantWithOrg('apps-list-filter');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      await createTestApp({ tenantId, projectId });
      await createTestApp({ tenantId, projectId, type: 'api' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps?type=web_client`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].type).toBe('web_client');
    });

    it('should return empty list for project with no apps', async () => {
      const tenantId = await createTestTenantWithOrg('apps-list-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('GET /{id}', () => {
    it('should get app by id', async () => {
      const tenantId = await createTestTenantWithOrg('apps-get');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app } = await createTestApp({ tenantId, projectId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/${app.id}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.id).toBe(app.id);
      expect(body.data).not.toHaveProperty('keyHash');
    });

    it('should return 404 for non-existent app', async () => {
      const tenantId = await createTestTenantWithOrg('apps-get-404');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/nonexistent-${generateId()}`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /{id}', () => {
    it('should update app name and config', async () => {
      const tenantId = await createTestTenantWithOrg('apps-update');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app } = await createTestApp({ tenantId, projectId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/${app.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Widget',
            enabled: false,
          }),
        }
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.name).toBe('Updated Widget');
      expect(body.data.enabled).toBe(false);
    });

    it('should return 404 for non-existent app', async () => {
      const tenantId = await createTestTenantWithOrg('apps-update-404');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/nonexistent-${generateId()}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete app', async () => {
      const tenantId = await createTestTenantWithOrg('apps-delete');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app } = await createTestApp({ tenantId, projectId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/${app.id}`,
        { method: 'DELETE' }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/${app.id}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent app', async () => {
      const tenantId = await createTestTenantWithOrg('apps-delete-404');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/nonexistent-${generateId()}`,
        { method: 'DELETE' }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Security', () => {
    it('should never expose keyHash in any response', async () => {
      const tenantId = await createTestTenantWithOrg('apps-security');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app } = await createTestApp({ tenantId, projectId, type: 'api' });

      const endpoints = [
        `/manage/tenants/${tenantId}/projects/${projectId}/apps`,
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/${app.id}`,
      ];

      for (const endpoint of endpoints) {
        const res = await makeRequest(endpoint);
        const body = await res.json();

        const checkForKeyHash = (obj: unknown) => {
          if (Array.isArray(obj)) {
            for (const item of obj) checkForKeyHash(item);
          } else if (obj && typeof obj === 'object') {
            expect(obj).not.toHaveProperty('keyHash');
            for (const val of Object.values(obj)) checkForKeyHash(val);
          }
        };

        checkForKeyHash(body);
      }
    });

    it('should only return app secret once during creation', async () => {
      const tenantId = await createTestTenantWithOrg('apps-secret-once');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app, appSecret } = await createTestApp({
        tenantId,
        projectId,
        type: 'api',
      });

      expect(appSecret).toBeDefined();

      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/apps/${app.id}`
      );
      const getBody = await getRes.json();
      expect(getBody.data).not.toHaveProperty('appSecret');
    });
  });
});
