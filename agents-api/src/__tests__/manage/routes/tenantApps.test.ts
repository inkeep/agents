import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../data/db/manageDbClient';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantWithOrg } from '../../utils/testTenant';

describe('Tenant Apps Routes - Integration Tests', () => {
  const createApp = async ({
    tenantId,
    projectId,
    type,
    name,
  }: {
    tenantId: string;
    projectId: string;
    type: 'web_client' | 'api' | 'support_copilot';
    name: string;
  }) => {
    const body: Record<string, unknown> = {
      name,
      type,
      defaultAgentId: 'agent-1',
      config:
        type === 'web_client'
          ? {
              type: 'web_client',
              webClient: { allowedDomains: ['help.customer.com'] },
            }
          : type === 'api'
            ? { type: 'api', api: {} }
            : {
                type: 'support_copilot',
                supportCopilot: { platform: 'zendesk' },
              },
    };

    const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/apps`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
    const respBody = await res.json();
    return respBody.data.app;
  };

  describe('GET /manage/tenants/:tenantId/apps', () => {
    it('should list apps across all projects in the tenant', async () => {
      const tenantId = await createTestTenantWithOrg('tenant-apps-list');
      const projectA = 'project-a';
      const projectB = 'project-b';
      await createTestProject(manageDbClient, tenantId, projectA);
      await createTestProject(manageDbClient, tenantId, projectB);

      await createApp({ tenantId, projectId: projectA, type: 'web_client', name: 'A Web' });
      await createApp({ tenantId, projectId: projectB, type: 'api', name: 'B API' });

      const res = await makeRequest(`/manage/tenants/${tenantId}/apps?page=1&limit=10`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
      const projectIds = body.data.map(
        (app: { defaultProjectId: string | null }) => app.defaultProjectId
      );
      expect(projectIds).toContain(projectA);
      expect(projectIds).toContain(projectB);
    });

    it('should filter by type=support_copilot across projects', async () => {
      const tenantId = await createTestTenantWithOrg('tenant-apps-filter-copilot');
      const projectA = 'project-a';
      const projectB = 'project-b';
      await createTestProject(manageDbClient, tenantId, projectA);
      await createTestProject(manageDbClient, tenantId, projectB);

      await createApp({
        tenantId,
        projectId: projectA,
        type: 'support_copilot',
        name: 'A Copilot',
      });
      await createApp({
        tenantId,
        projectId: projectB,
        type: 'support_copilot',
        name: 'B Copilot',
      });
      await createApp({ tenantId, projectId: projectA, type: 'web_client', name: 'A Web' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/apps?type=support_copilot&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(2);
      for (const app of body.data) {
        expect(app.type).toBe('support_copilot');
      }
    });

    it('should return empty list for tenant with no apps', async () => {
      const tenantId = await createTestTenantWithOrg('tenant-apps-empty');
      const projectId = 'default-project';
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(`/manage/tenants/${tenantId}/apps?limit=10`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });
  });
});
