import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/manageDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

const projectId = 'default';

function isValidDate(value: string) {
  const date = new Date(value);
  return !Number.isNaN(date);
}

describe('Skills CRUD Routes - Integration Tests', () => {
  it('should return ISO timestamps for create/update', async () => {
    const tenantId = await createTestTenantWithOrg('skills-update-timestamps');
    await createTestProject(manageDbClient, tenantId, projectId);
    const unique = generateId(8);

    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `skill-${unique}`,
          description: `Skill description ${unique}`,
          content: `Skill content ${unique}`,
        }),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();

    const updateRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/skills/${createBody.data.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ description: 'updated' }),
      }
    );
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();

    expect(isValidDate(updateBody.data.createdAt)).toBe(true);
    expect(isValidDate(updateBody.data.updatedAt)).toBe(true);
  });
});
