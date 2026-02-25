import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

const projectId = 'default';

function isValidDate(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

describe('Skills CRUD Routes - Integration Tests', () => {
  it('should return ISO timestamps for create/update', async () => {
    const tenantId = await createTestTenantWithOrg('skills-update-timestamps');
    await createTestProject(manageDbClient, tenantId, projectId);

    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'skill',
          description: 'Skill description',
          content: 'Skill content',
        }),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();

    expect(isValidDate(createBody.data.createdAt)).toBe(true);
    expect(isValidDate(createBody.data.updatedAt)).toBe(true);
  });
});
