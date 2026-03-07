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
            defaultAgentId: 'agent-1',
            config: {
              type: 'web_client',
              webClient: {
                allowedDomains: ['help.customer.com'],
              },
            },
          }
        : {
            name,
            type: 'api',
            defaultAgentId: 'agent-1',
            config: { type: 'api', api: {} },
          };

    const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { app: createBody.data.app };
  };

  describe('POST /', () => {
    it('should create a web_client app', async () => {
      const tenantId = await createTestTenantWithOrg('apps-create-web');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app } = await createTestApp({ tenantId, projectId });

      expect(app.type).toBe('web_client');
      expect(app.name).toBe('Test App');
      expect(app.enabled).toBe(true);
      expect(app.defaultAgentId).toBe('agent-1');
      expect(app.config.type).toBe('web_client');
      expect(app.config.webClient.allowedDomains).toEqual(['help.customer.com']);
    });

    it('should create an api app', async () => {
      const tenantId = await createTestTenantWithOrg('apps-create-api');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const { app } = await createTestApp({
        tenantId,
        projectId,
        type: 'api',
        name: 'Backend API',
      });

      expect(app.type).toBe('api');
      expect(app.name).toBe('Backend API');
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
});
