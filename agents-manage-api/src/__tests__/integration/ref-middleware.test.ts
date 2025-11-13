import { generateId } from '@inkeep/agents-core';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import dbClient from '../../data/db/dbClient';
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

  // Helper to create a branch directly using Dolt
  const createDoltBranch = async (branchName: string) => {
    await dbClient.execute(sql.raw(`CALL DOLT_BRANCH('${branchName}')`));
  };

  // Helper to create a tag directly using Dolt
  const createDoltTag = async (tagName: string, ref: string = 'HEAD') => {
    createdTags.add(tagName);
    await dbClient.execute(sql.raw(`CALL DOLT_TAG('${tagName}', '${ref}')`));
  };

  // Helper to get commit hash
  const getCommitHash = async (ref: string = 'HEAD') => {
    const result = await dbClient.execute(sql.raw(`SELECT DOLT_HASHOF('${ref}') as hash`));
    return result.rows[0]?.hash as string;
  };

  describe('refMiddleware - Tenant Main Branch', () => {
    it('should auto-create tenant main branch on first request', async () => {
      const tenantId = createTestTenantId('ref-auto-create-main');
      const projectId = await createTestProject(tenantId);

      // First request should create tenant_main
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`);
      expect(res.status).toBe(200);

      // Verify tenant_main was created
      const branches = await dbClient.execute(
        sql.raw(`SELECT * FROM dolt_branches WHERE name = '${tenantId}_main'`)
      );

      expect(branches.rows).toHaveLength(1);
      expect(branches.rows[0]).toHaveProperty('name', `${tenantId}_main`);
    });

    it('should use existing tenant main branch if it already exists', async () => {
      const tenantId = createTestTenantId('ref-existing-main');

      // Create tenant main manually BEFORE making any API requests
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);

      // Now create project (this will go through refMiddleware and should reuse the existing branch)
      const projectId = await createTestProject(tenantId);

      // Get the hash after creating project
      const hashBefore = await getCommitHash(tenantMain);

      // Make another request - hash should stay the same (just reading, not writing)
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`);
      expect(res.status).toBe(200);

      const hashAfter = await getCommitHash(tenantMain);
      expect(hashAfter).toBe(hashBefore);
    });

    it('should default to tenant main when no ref query param provided', async () => {
      const tenantId = createTestTenantId('ref-default-main');
      const projectId = await createTestProject(tenantId);

      // Make request without ref param
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`);
      expect(res.status).toBe(200);

      // The middleware should have used tenant_main (no errors means it worked)
    });
  });

  describe('refMiddleware - Custom Ref Resolution', () => {
    it('should resolve custom branch ref when provided', async () => {
      const tenantId = createTestTenantId('ref-custom-branch');
      const projectId = await createTestProject(tenantId);

      // Create a custom branch
      const customBranch = `${tenantId}_${projectId}_custom`;
      await createDoltBranch(customBranch);

      // Make request with custom ref
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${customBranch}`
      );
      expect(res.status).toBe(200);
    });

    it('should resolve tag ref when provided', async () => {
      const tenantId = createTestTenantId('ref-tag');

      // Create tenant main first (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);

      // Create a tag
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, tenantMain);

      // Now create project
      const projectId = await createTestProject(tenantId);

      // Make request with tag ref
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${tagName}`
      );
      expect(res.status).toBe(200);
    });

    it('should resolve commit hash ref when provided', async () => {
      const tenantId = createTestTenantId('ref-commit-hash');

      // Create tenant main (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);

      // Create project (this will create a commit)
      const projectId = await createTestProject(tenantId);

      // Get the commit hash AFTER creating the project
      const commitHash = await getCommitHash(tenantMain);

      // Make request with commit hash
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${commitHash}`
      );
      expect(res.status).toBe(200);
    });

    it('should return 404 for unknown ref', async () => {
      const tenantId = createTestTenantId('ref-unknown');
      const projectId = await createTestProject(tenantId);

      // Make request with non-existent ref
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=non-existent-ref`
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

      // Create a custom branch to use as ref
      const customBranch = `${tenantId}_${projectId}_writeable`;
      await createDoltBranch(customBranch);

      // POST should be allowed on a branch
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${customBranch}`,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'new-branch' }),
        }
      );

      // Should succeed or get a business logic error (not middleware error)
      expect(res.status).not.toBe(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should allow DELETE requests to branches', async () => {
      const tenantId = createTestTenantId('write-branch-delete');
      const projectId = await createTestProject(tenantId);

      // Create a custom branch to use as ref
      const customBranch = `${tenantId}_${projectId}_writeable`;
      await createDoltBranch(customBranch);

      // Create a branch to delete
      const res1 = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${customBranch}`,
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

      // Create a custom branch to use as ref
      const customBranch = `${tenantId}_${projectId}_writeable`;
      await createDoltBranch(customBranch);

      // PATCH should be allowed on a branch (even if route doesn't exist)
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}?ref=${customBranch}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Name' }),
        }
      );

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

      // Create tenant main and a tag (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, tenantMain);

      // Now create project
      const projectId = await createTestProject(tenantId);

      // POST should be blocked on a tag
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${tagName}`,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'new-branch' }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain('Cannot perform write operation');
      expect(body.error.message).toContain('tag');
      expect(body.error.message).toContain('immutable');
    });

    it('should block DELETE requests to tags', async () => {
      const tenantId = createTestTenantId('write-tag-delete');

      // Create tenant main and a tag (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, tenantMain);

      // Now create project
      const projectId = await createTestProject(tenantId);

      // DELETE should be blocked on a tag
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches/some-branch?ref=${tagName}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('Cannot perform write operation');
    });

    it('should allow GET requests to tags', async () => {
      const tenantId = createTestTenantId('read-tag-get');

      // Create tenant main and a tag (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, tenantMain);

      // Now create project
      const projectId = await createTestProject(tenantId);

      // GET should be allowed on a tag
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${tagName}`
      );

      expect(res.status).toBe(200);
    });
  });

  describe('writeProtectionMiddleware - Commit Write Protection', () => {
    it('should block POST requests to commits', async () => {
      const tenantId = createTestTenantId('write-commit-post');

      // Create tenant main (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);

      // Create project (this will create a commit)
      const projectId = await createTestProject(tenantId);

      // Get commit hash AFTER creating the project
      const commitHash = await getCommitHash(tenantMain);

      // POST should be blocked on a commit
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${commitHash}`,
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

      // Create tenant main (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);

      // Create project (this will create a commit)
      const projectId = await createTestProject(tenantId);

      // Get commit hash AFTER creating the project
      const commitHash = await getCommitHash(tenantMain);

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

      // Create tenant main (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);

      // Create project (this will create a commit)
      const projectId = await createTestProject(tenantId);

      // Get commit hash AFTER creating the project
      const commitHash = await getCommitHash(tenantMain);

      // GET should be allowed on a commit
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${commitHash}`
      );

      expect(res.status).toBe(200);
    });
  });

  describe('writeProtectionMiddleware - Edge Cases', () => {
    it('should allow writes when no ref is resolved', async () => {
      const tenantId = createTestTenantId('write-no-ref');
      const projectId = await createTestProject(tenantId);

      // Without explicit ref, should default to tenant main (which is a branch)
      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/branches`, {
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

      // Create tenant main and a tag (BEFORE any API requests)
      const tenantMain = `${tenantId}_main`;
      await createDoltBranch(tenantMain);
      const tagName = 'v1.0.0';
      await createDoltTag(tagName, tenantMain);

      // Now create project
      const projectId = await createTestProject(tenantId);

      // OPTIONS should be allowed on tags
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/branches?ref=${tagName}`,
        {
          method: 'OPTIONS',
        }
      );

      // Should not get write protection error
      expect(res.status).not.toBe(400);
      if (res.status === 400) {
        const body = await res.json();
        expect(body.error?.message).not.toContain('Cannot perform write operation');
      }
    });
  });
});
