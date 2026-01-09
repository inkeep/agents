import { doltBranch, doltHashOf, generateId } from '@inkeep/agents-core';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import manageDbClient from '../../data/db/dbClient';
import { cleanupTenants } from '../utils/cleanup';
import { makeRequest } from '../utils/testRequest';
import { createTestTenantId } from '../utils/testTenant';

describe('Ref Middleware - Integration Tests', () => {
  // Track tenants and tags created during tests for cleanup
  const createdTenants = new Set<string>();
  const createdTags = new Set<string>();

  afterEach(async () => {
    // Clean up all tenants and tags created during tests
    await cleanupTenants(createdTenants, createdTags);
    createdTenants.clear();
    createdTags.clear();
  });

  // Helper to create a test project
  const createTestProject = async (tenantId: string) => {
    createdTenants.add(tenantId);
    const projectId = `test-project-${generateId(6)}`;
    const projectData = {
      id: projectId,
      name: 'Test Project',
      description: 'Test project for ref middleware tests',
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

  // Helper to create a tag directly using Dolt on a specific branch
  const createDoltTag = async (tagName: string, branchName: string) => {
    createdTags.add(tagName);
    // Tags need to reference the branch explicitly
    await manageDbClient.execute(sql.raw(`SELECT DOLT_TAG('${tagName}', '${branchName}')`));
  };

  // Helper to get commit hash from a specific branch
  const getCommitHash = async (branchName: string) => {
    const result = await doltHashOf(manageDbClient)({ revision: branchName });
    return result;
  };

  // Helper to get the project's main branch name
  const getProjectMainBranch = (tenantId: string, projectId: string) => {
    return `${tenantId}_${projectId}_main`;
  };

  describe('refMiddleware - Project Main Branch', () => {
    it('should auto-create project main branch when creating a project', async () => {
      const tenantId = createTestTenantId('ref-auto-create-main');
      const projectId = await createTestProject(tenantId);

      // Verify project main branch was created
      const projectMain = getProjectMainBranch(tenantId, projectId);
      const branches = await manageDbClient.execute(
        sql.raw(`SELECT * FROM dolt_branches WHERE name = '${projectMain}'`)
      );

      expect(branches.rows).toHaveLength(1);
      expect(branches.rows[0]).toHaveProperty('name', projectMain);
    });

    it('should use project main branch when querying a project', async () => {
      const tenantId = createTestTenantId('ref-existing-main');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);
      const hashBefore = await getCommitHash(projectMain);

      // Make GET request - hash should stay the same (just reading, not writing)
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}`);
      expect(res.status).toBe(200);

      const hashAfter = await getCommitHash(projectMain);
      expect(hashAfter).toBe(hashBefore);
    });

    it('should default to project main when no ref query param provided', async () => {
      const tenantId = createTestTenantId('ref-default-main');
      const projectId = await createTestProject(tenantId);

      // Make request without ref param
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}`);
      expect(res.status).toBe(200);

      // The middleware should have used project_main (no errors means it worked)
    });
  });

  describe('refMiddleware - Custom Ref Resolution', () => {
    it('should resolve custom branch ref when provided', async () => {
      const tenantId = createTestTenantId('ref-custom-branch');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a custom branch from the project main branch
      const customBranch = `${tenantId}_${projectId}_custom`;
      await doltBranch(manageDbClient)({ name: customBranch, startPoint: projectMain });

      // Make request with custom ref
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=custom`);

      expect(res.status).toBe(200);
    });

    it('should resolve tag ref when provided', async () => {
      const tenantId = createTestTenantId('ref-tag');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a tag on the project main branch (which has the project data)
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, projectMain);

      // Make request with tag ref - should find the project since tag points to project branch
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=${tagName}`);
      expect(res.status).toBe(200);
    });

    it('should resolve commit hash ref when provided', async () => {
      const tenantId = createTestTenantId('ref-commit-hash');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Get the commit hash from the project main branch
      const commitHash = await getCommitHash(projectMain);

      // Make request with commit hash
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=${commitHash}`);
      expect(res.status).toBe(200);
    });

    it('should return 404 for unknown ref', async () => {
      const tenantId = createTestTenantId('ref-unknown');
      const projectId = await createTestProject(tenantId);

      // Make request with non-existent ref
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}?ref=non-existent-ref`
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toContain('Unknown ref');
    });
  });

  describe('writeProtectionMiddleware - Branch Writes', () => {
    it('should allow POST requests to branches', async () => {
      const tenantId = createTestTenantId('write-branch-post');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a custom branch from project main
      const customBranch = `${tenantId}_${projectId}_writeable`;
      await doltBranch(manageDbClient)({ name: customBranch, startPoint: projectMain });

      // POST should be allowed on a branch
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=writeable`, {
        method: 'POST',
        body: JSON.stringify({ name: 'new-branch' }),
      });

      // Should succeed or get a business logic error (not middleware error)
      expect(res.status).not.toBe(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should allow DELETE requests to branches', async () => {
      const tenantId = createTestTenantId('write-branch-delete');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a custom branch from project main
      const customBranch = `${tenantId}_${projectId}_writeable`;
      await doltBranch(manageDbClient)({ name: customBranch, startPoint: projectMain });

      // Create a branch to delete
      const res1 = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=writeable`,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'temp-branch' }),
        }
      );
      expect(res1.status).toBe(201);

      // DELETE should be allowed on a branch
      const res2 = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/temp-branch?ref=${customBranch}`,
        {
          method: 'DELETE',
        }
      );

      expect(res2.status).not.toBe(400);
    });

    it('should allow PATCH requests to branches', async () => {
      const tenantId = createTestTenantId('write-branch-patch');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a custom branch from project main
      const customBranch = `${tenantId}_${projectId}_writeable`;
      await doltBranch(manageDbClient)({ name: customBranch, startPoint: projectMain });

      // PATCH should be allowed on a branch (even if route doesn't exist)
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=writeable`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
      });

      // Should not get middleware error (might get 404 if route doesn't exist)
      expect(res.status).not.toBe(400);
      // Specifically should not get "Cannot perform write operation" error
      if (res.status === 400) {
        const body = await res.json();
        expect(body.error?.message).not.toContain('Cannot perform write operation');
      }
    });
  });

  describe('writeProtectionMiddleware - Tag Write Protection', () => {
    it('should block POST requests to tags', async () => {
      const tenantId = createTestTenantId('write-tag-post');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a tag on the project main branch
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, projectMain);

      // POST should be blocked on a tag
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=${tagName}`, {
        method: 'POST',
        body: JSON.stringify({ name: 'new-branch' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Cannot perform write operation');
      expect(body.error.message).toContain('tag');
      expect(body.error.message).toContain('immutable');
    });

    it('should block DELETE requests to tags', async () => {
      const tenantId = createTestTenantId('write-tag-delete');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a tag on the project main branch
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, projectMain);

      // DELETE should be blocked on a tag
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=${tagName}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('Cannot perform write operation');
    });

    it('should allow GET requests to tags', async () => {
      const tenantId = createTestTenantId('read-tag-get');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a tag on the project main branch
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, projectMain);

      // GET should be allowed on a tag
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=${tagName}`);

      expect(res.status).toBe(200);
    });
  });

  describe('writeProtectionMiddleware - Commit Write Protection', () => {
    it('should block POST requests to commits', async () => {
      const tenantId = createTestTenantId('write-commit-post');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Get commit hash from the project main branch
      const commitHash = await getCommitHash(projectMain);

      // POST should be blocked on a commit
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}?ref=${commitHash}`,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'new-branch' }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Cannot perform write operation');
      expect(body.error.message).toContain('commit');
      expect(body.error.message).toContain('immutable');
    });

    it('should block PUT requests to commits', async () => {
      const tenantId = createTestTenantId('write-commit-put');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Get commit hash from the project main branch
      const commitHash = await getCommitHash(projectMain);

      // PUT should be blocked on a commit
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}?ref=${commitHash}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('Cannot perform write operation');
    });

    it('should allow GET requests to commits', async () => {
      const tenantId = createTestTenantId('read-commit-get');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Get commit hash from the project main branch
      const commitHash = await getCommitHash(projectMain);

      // GET should be allowed on a commit
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=${commitHash}`);

      expect(res.status).toBe(200);
    });
  });

  describe('writeProtectionMiddleware - Edge Cases', () => {
    it('should allow writes when no ref is resolved', async () => {
      const tenantId = createTestTenantId('write-no-ref');
      const projectId = await createTestProject(tenantId);

      // Without explicit ref, should default to project main (which is a branch)
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}`, {
        method: 'POST',
        body: JSON.stringify({ name: 'new-branch' }),
      });

      // Should not get middleware error
      expect(res.status).not.toBe(400);
      if (res.status === 400) {
        const body = await res.json();
        expect(body.error?.message).not.toContain('Cannot perform write operation');
      }
    });

    it('should handle OPTIONS requests to any ref type', async () => {
      const tenantId = createTestTenantId('write-options');
      const projectId = await createTestProject(tenantId);

      const projectMain = getProjectMainBranch(tenantId, projectId);

      // Create a tag on the project main branch
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, projectMain);

      // OPTIONS should be allowed on tags
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}?ref=${tagName}`, {
        method: 'OPTIONS',
      });

      // Should not get write protection error
      expect(res.status).not.toBe(400);
      if (res.status === 400) {
        const body = await res.json();
        expect(body.error?.message).not.toContain('Cannot perform write operation');
      }
    });
  });
});
