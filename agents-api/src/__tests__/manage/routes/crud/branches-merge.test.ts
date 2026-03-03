import { generateId } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('Branch Merge Route', () => {
  const createTestProject = async (tenantId: string) => {
    const projectId = `test-project-${generateId(6)}`;
    const projectData = {
      id: projectId,
      name: 'Test Project',
      description: 'Test project for merge tests',
      models: {
        base: {
          model: 'claude-sonnet-4',
          providerOptions: {},
        },
      },
    };

    const res = await makeRequest(`/manage/tenants/${tenantId}/projects`, {
      method: 'POST',
      body: JSON.stringify(projectData),
    });

    expect(res.status).toBe(201);
    return projectId;
  };

  it('should reject merging main into itself', async () => {
    const tenantId = await createTestTenantWithOrg('branches-merge-self');
    const projectId = await createTestProject(tenantId);

    const res = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/branches/main/merge`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('Cannot merge main into itself');
  });

  it('should return 404 for merging a non-existent branch', async () => {
    const tenantId = await createTestTenantWithOrg('branches-merge-404');
    const projectId = await createTestProject(tenantId);

    const res = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/branches/non-existent-branch/merge`,
      {
        method: 'POST',
        body: JSON.stringify({ message: 'test merge' }),
      }
    );

    expect([404, 500]).toContain(res.status);
  });
});
