import { generateId } from '@inkeep/agents-core';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTenants } from '../utils/cleanup';
import { makeRequest } from '../utils/testRequest';
import { createTestTenantId } from '../utils/testTenant';

describe('Branch CRUD Routes - Integration Tests', () => {
  // Track tenants created during tests for cleanup
  const createdTenants = new Set<string>();

  afterEach(async () => {
    // Clean up all tenant branches created during tests
    await cleanupTenants(createdTenants);
    createdTenants.clear();
  });

  // Helper function to create test project
  const createTestProject = async (tenantId: string) => {
    createdTenants.add(tenantId);
    const projectId = `test-project-${generateId(6)}`;
    const projectData = {
      id: projectId,
      name: 'Test Project',
      description: 'Test project for branch tests',
      models: {
        base: {
          model: 'claude-sonnet-4',
          providerOptions: {},
        },
      },
    };

    const res = await makeRequest(`/tenants/${tenantId}/projects`, {
      method: 'POST',
      body: JSON.stringify(projectData),
    });

    expect(res.status).toBe(201);
    return projectId;
  };

  // Helper function to create a test branch
  const createTestBranch = async ({
    tenantId,
    projectId,
    name,
    from,
  }: {
    tenantId: string;
    projectId: string;
    name: string;
    from?: string;
  }) => {
    const branchData = { name, ...(from && { from }) };
    const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
      method: 'POST',
      body: JSON.stringify(branchData),
    });

    // Debug failed requests
    if (res.status !== 201) {
      const errorBody = await res.json();
      console.error('Branch creation failed:', {
        status: res.status,
        error: errorBody,
        requestData: branchData,
      });
    }

    expect(res.status).toBe(201);
    const body = await res.json();
    return body.data;
  };

  describe('GET /', () => {
    it('should list branches (empty initially except main)', async () => {
      const tenantId = createTestTenantId('branches-list-empty');
      const projectId = await createTestProject(tenantId);

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].baseName).toBe('main');
    });

    it('should list branches after creating some', async () => {
      const tenantId = createTestTenantId('branches-list-multiple');
      const projectId = await createTestProject(tenantId);

      // Create multiple branches
      await createTestBranch({ tenantId, projectId, name: 'feature-a' });
      await createTestBranch({ tenantId, projectId, name: 'feature-b' });
      await createTestBranch({ tenantId, projectId, name: 'feature-c' });

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(4); // tenant main + 3 feature branches

      const branchNames = body.data.map((b: any) => b.baseName).sort();
      expect(branchNames).toEqual(['feature-a', 'feature-b', 'feature-c', 'main']);

      const projectBranches = body.data.filter((b: any) => b.baseName !== 'main');
      // Verify each branch has required fields
      projectBranches.forEach((branch: any) => {
        expect(branch).toHaveProperty('baseName');
        expect(branch).toHaveProperty('fullName');
        expect(branch).toHaveProperty('hash');
        expect(branch.fullName).toContain(tenantId);
        expect(branch.fullName).toContain(projectId);
      });
    });

    it('should not show branches from other projects', async () => {
      const tenantId = createTestTenantId('branches-list-isolation');
      const projectId1 = await createTestProject(tenantId);
      const projectId2 = await createTestProject(tenantId);

      // Create branches in project 1
      await createTestBranch({ tenantId, projectId: projectId1, name: 'project1-branch' });

      // Create branches in project 2
      await createTestBranch({ tenantId, projectId: projectId2, name: 'project2-branch' });

      // List branches for project 1
      const res1 = await makeRequest(`/tenants/${tenantId}/projects/${projectId1}/branches`);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.data).toHaveLength(2); // tenant main + project1-branch
      expect(body1.data[1].baseName).toBe('project1-branch');

      // List branches for project 2
      const res2 = await makeRequest(`/tenants/${tenantId}/projects/${projectId2}/branches`);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.data).toHaveLength(2); // tenant main + project2-branch
      expect(body2.data[1].baseName).toBe('project2-branch');
    });
  });

  describe('GET /:branchName', () => {
    it('should get a single branch by name', async () => {
      const tenantId = createTestTenantId('branches-get-single');
      const projectId = await createTestProject(tenantId);
      const branchName = 'feature-x';

      await createTestBranch({ tenantId, projectId, name: branchName });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/${branchName}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        baseName: branchName,
      });
      expect(body.data.fullName).toContain(tenantId);
      expect(body.data.fullName).toContain(projectId);
      expect(body.data.fullName).toContain(branchName);
      expect(body.data.hash).toBeDefined();
    });

    it('should return 404 for non-existent branch', async () => {
      const tenantId = createTestTenantId('branches-get-notfound');
      const projectId = await createTestProject(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/non-existent-branch`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('not_found');
    });

    it('should not return branches from other projects', async () => {
      const tenantId = createTestTenantId('branches-get-project-isolation');
      const projectId1 = await createTestProject(tenantId);
      const projectId2 = await createTestProject(tenantId);
      const branchName = 'feature-x';

      // Create branch in project 1
      await createTestBranch({ tenantId, projectId: projectId1, name: branchName });

      // Try to get it from project 2
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId2}/branches/${branchName}`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new branch from tenant main (default)', async () => {
      const tenantId = createTestTenantId('branches-create-default');
      const projectId = await createTestProject(tenantId);
      const branchName = 'feature-new';

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: branchName }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        baseName: branchName,
      });
      expect(body.data.fullName).toContain(branchName);
      expect(body.data.hash).toBeDefined();

      // Verify it was actually created
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/${branchName}`
      );
      expect(getRes.status).toBe(200);
    });

    it('should create a branch from a specific branch', async () => {
      const tenantId = createTestTenantId('branches-create-from');
      const projectId = await createTestProject(tenantId);

      // Create base branch
      const baseBranch = await createTestBranch({
        tenantId,
        projectId,
        name: 'base-branch',
      });

      // Create new branch from base
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'derived-branch',
          from: baseBranch.fullName,
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data.baseName).toBe('derived-branch');
      expect(body.data.hash).toBe(baseBranch.hash); // Should have same hash as source
    });

    it('should return 409 when creating a branch that already exists', async () => {
      const tenantId = createTestTenantId('branches-create-duplicate');
      const projectId = await createTestProject(tenantId);
      const branchName = 'duplicate-branch';

      // Create first branch
      const res1 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: branchName }),
      });
      expect(res1.status).toBe(201);

      // Try to create second branch with same name
      const res2 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: branchName }),
      });

      expect(res2.status).toBe(409);
      const body = await res2.json();
      expect(body.error.code).toBe('conflict');
      expect(body.error.message).toContain('already exists');
    });

    it('should validate branch name format', async () => {
      const tenantId = createTestTenantId('branches-create-invalid');
      const projectId = await createTestProject(tenantId);

      // Empty name
      const res1 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });
      expect(res1.status).toBe(400);

      // Invalid characters (spaces)
      const res2 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: 'invalid branch name' }),
      });
      expect(res2.status).toBe(400);

      // Invalid characters (special chars)
      const res3 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: 'branch@name!' }),
      });
      expect(res3.status).toBe(400);
    });

    it('should accept valid branch name formats', async () => {
      const tenantId = createTestTenantId('branches-create-valid-names');
      const projectId = await createTestProject(tenantId);

      // With hyphens
      const res1 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: 'feature-branch-name' }),
      });
      expect(res1.status).toBe(201);

      // With underscores
      const res2 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: 'feature_branch_name' }),
      });
      expect(res2.status).toBe(201);

      // With slashes (common git pattern)
      const res3 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: 'feature/branch-name' }),
      });
      expect(res3.status).toBe(201);

      // With dots
      const res4 = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name: 'release.1.0.0' }),
      });
      expect(res4.status).toBe(201);
    });

    it('should handle missing name field', async () => {
      const tenantId = createTestTenantId('branches-create-no-name');
      const projectId = await createTestProject(tenantId);

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:branchName', () => {
    it('should delete a branch', async () => {
      const tenantId = createTestTenantId('branches-delete');
      const projectId = await createTestProject(tenantId);
      const branchName = 'temp-branch';

      // Create the branch
      await createTestBranch({ tenantId, projectId, name: branchName });

      // Verify it exists
      const getRes1 = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/${branchName}`
      );
      expect(getRes1.status).toBe(200);

      // Delete it
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/${branchName}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify it's gone
      const getRes2 = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/${branchName}`
      );
      expect(getRes2.status).toBe(404);
    });

    it('should return 404 when deleting non-existent branch', async () => {
      const tenantId = createTestTenantId('branches-delete-notfound');
      const projectId = await createTestProject(tenantId);

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/non-existent-branch`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('not_found');
    });

    it('should return 403 when trying to delete protected branch (main)', async () => {
      const tenantId = createTestTenantId('branches-delete-protected');
      const projectId = await createTestProject(tenantId);

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches/main`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('forbidden');
      expect(body.error.message).toContain('protected');
    });

    it('should not delete branches from other projects', async () => {
      const tenantId = createTestTenantId('branches-delete-project-isolation');
      const projectId1 = await createTestProject(tenantId);
      const projectId2 = await createTestProject(tenantId);
      const branchName = 'feature-x';

      // Create branch in project 1
      await createTestBranch({ tenantId, projectId: projectId1, name: branchName });

      // Try to delete it from project 2
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId2}/branches/${branchName}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);

      // Verify branch still exists in project 1
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId1}/branches/${branchName}`
      );
      expect(getRes.status).toBe(200);
    });
  });

  describe('Tenant Isolation', () => {
    it('should isolate branches across different tenants', async () => {
      const tenantId1 = createTestTenantId('branches-tenant1');
      const tenantId2 = createTestTenantId('branches-tenant2');

      const projectId1 = await createTestProject(tenantId1);
      const projectId2 = await createTestProject(tenantId2);

      const branchName = 'shared-name';

      // Create branch with same name in both tenants
      await createTestBranch({ tenantId: tenantId1, projectId: projectId1, name: branchName });
      await createTestBranch({ tenantId: tenantId2, projectId: projectId2, name: branchName });

      // Get branch from tenant 1
      const res1 = await makeRequest(
        `/tenants/${tenantId1}/projects/${projectId1}/branches/${branchName}`
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.data.fullName).toContain(tenantId1);

      // Get branch from tenant 2
      const res2 = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId2}/branches/${branchName}`
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.data.fullName).toContain(tenantId2);

      // Verify they have different full names
      expect(body1.data.fullName).not.toBe(body2.data.fullName);
    });
  });
});
