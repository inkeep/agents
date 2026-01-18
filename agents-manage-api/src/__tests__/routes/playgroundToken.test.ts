import { describe, expect, it } from 'vitest';
import { makeRequest } from '../utils/testRequest';
import { createTestTenantWithOrg } from '../utils/testTenant';

describe('Playground Token Routes', () => {
  describe('POST /tenants/:tenantId/playground/token', () => {
    it('should return 404 if project does not exist', async () => {
      const testTenantId = await createTestTenantWithOrg('playground-no-project');
      const nonExistentProject = 'non-existent-project-xyz';
      const agentId = 'test-agent';

      const response = await makeRequest(`/tenants/${testTenantId}/playground/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: nonExistentProject,
          agentId,
        }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.message).toContain('Project not found');
    });

    it('should return 400 if request body is invalid', async () => {
      const testTenantId = await createTestTenantWithOrg('playground-validation');

      const response = await makeRequest(`/tenants/${testTenantId}/playground/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 if projectId is missing', async () => {
      const testTenantId = await createTestTenantWithOrg('playground-no-project-id');

      const response = await makeRequest(`/tenants/${testTenantId}/playground/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: 'some-agent',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 if agentId is missing', async () => {
      const testTenantId = await createTestTenantWithOrg('playground-no-agent-id');

      const response = await makeRequest(`/tenants/${testTenantId}/playground/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: 'some-project',
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
