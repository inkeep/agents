import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

describe('Artifact Component CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test artifact component data
  const createArtifactComponentData = ({ suffix = '' } = {}) => ({
    id: `test-artifact-component${suffix.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`,
    name: `TestArtifactComponent${suffix}`,
    description: `Test artifact component description${suffix}`,
    props: {
      type: 'object',
      properties: {
        title: { type: 'string', description: `Title field${suffix}`, isPreview: true },
        type: { type: 'string', description: `Type field${suffix}`, isPreview: true },
        content: { type: 'string', description: `Content field${suffix}`, isPreview: false },
        metadata: {
          type: 'object',
          isPreview: false,
          properties: {
            author: { type: 'string' },
            created: { type: 'string', format: 'date-time' },
          },
        },
      },
      required: ['title', 'content'],
    },
  });

  // Helper function to create an artifact component and return its ID
  const createTestArtifactComponent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    // Ensure the project exists for this tenant before creating the artifact component
    await ensureTestProject(tenantId, projectId);

    const artifactComponentData = createArtifactComponentData({ suffix });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
      {
        method: 'POST',
        body: JSON.stringify(artifactComponentData),
      }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { artifactComponentData, artifactComponentId: createBody.data.id };
  };

  // Helper function to create multiple artifact components
  const createMultipleArtifactComponents = async ({
    tenantId,
    count,
  }: {
    tenantId: string;
    count: number;
  }) => {
    const artifactComponents: Awaited<ReturnType<typeof createTestArtifactComponent>>[] = [];
    for (let i = 1; i <= count; i++) {
      const artifactComponent = await createTestArtifactComponent({ tenantId, suffix: ` ${i}` });
      artifactComponents.push(artifactComponent);
    }
    return artifactComponents;
  };

  describe('GET /', () => {
    it('should list artifact components with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('artifact-components-list-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual({
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          pages: 0,
        },
      });
    });

    it('should list artifact components with pagination (single item)', async () => {
      const tenantId = createTestTenantId('artifact-components-list-single');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentData } = await createTestArtifactComponent({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        name: artifactComponentData.name,
        description: artifactComponentData.description,
        props: artifactComponentData.props,
        tenantId,
      });
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      });
    });

    it('should handle pagination with multiple pages (small page size)', async () => {
      const tenantId = createTestTenantId('artifact-components-list-multipages');
      await ensureTestProject(tenantId, projectId);
      const TOTAL_ITEMS = 5;
      const PAGE_SIZE = 2;

      await createMultipleArtifactComponents({ tenantId, count: TOTAL_ITEMS });

      // Test first page
      const firstPageRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components?page=1&limit=${PAGE_SIZE}`
      );
      expect(firstPageRes.status).toBe(200);
      const firstPageBody = await firstPageRes.json();
      expect(firstPageBody.data).toHaveLength(PAGE_SIZE);
      expect(firstPageBody.pagination).toEqual({
        page: 1,
        limit: PAGE_SIZE,
        total: TOTAL_ITEMS,
        pages: 3,
      });

      // Test last page
      const lastPageRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components?page=3&limit=${PAGE_SIZE}`
      );
      expect(lastPageRes.status).toBe(200);
      const lastPageBody = await lastPageRes.json();
      expect(lastPageBody.data).toHaveLength(1); // Only 1 item on the last page
      expect(lastPageBody.pagination).toEqual({
        page: 3,
        limit: PAGE_SIZE,
        total: TOTAL_ITEMS,
        pages: 3,
      });
    });

    it('should use default pagination values when not provided', async () => {
      const tenantId = createTestTenantId('artifact-components-list-defaults');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.pagination).toMatchObject({
        page: 1,
        limit: 10,
      });
    });

    it('should validate maximum page size to 100', async () => {
      const tenantId = createTestTenantId('artifact-components-list-max-limit');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components?limit=1000`
      );
      expect(res.status).toBe(400); // Validation error for limit > 100
    });
  });

  describe('GET /{id}', () => {
    it('should retrieve a specific artifact component', async () => {
      const tenantId = createTestTenantId('artifact-components-get-success');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentData, artifactComponentId } = await createTestArtifactComponent({
        tenantId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: artifactComponentId,
        name: artifactComponentData.name,
        description: artifactComponentData.description,
        props: artifactComponentData.props,
        tenantId,
      });
    });

    it('should return 404 for non-existent artifact component', async () => {
      const tenantId = createTestTenantId('artifact-components-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${nonExistentId}`
      );
      expect(res.status).toBe(404);
    });

    it('should return 404 for artifact component in different tenant', async () => {
      const tenantId1 = createTestTenantId('artifact-components-get-tenant1');
      const tenantId2 = createTestTenantId('artifact-components-get-tenant2');

      const { artifactComponentId } = await createTestArtifactComponent({ tenantId: tenantId1 });

      // Try to access from different tenant
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/artifact-components/${artifactComponentId}`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new artifact component with all fields', async () => {
      const tenantId = createTestTenantId('artifact-components-create-success');
      await ensureTestProject(tenantId, projectId);
      const artifactComponentData = createArtifactComponentData();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(artifactComponentData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        name: artifactComponentData.name,
        description: artifactComponentData.description,
        props: artifactComponentData.props,
        tenantId,
      });
      expect(body.data.id).toBeTruthy();
    });

    it('should create artifact component with custom ID when provided', async () => {
      const tenantId = createTestTenantId('artifact-components-create-custom-id');
      await ensureTestProject(tenantId, projectId);
      const customId = 'custom-artifact-component-id';
      const artifactComponentData = {
        ...createArtifactComponentData(),
        id: customId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(artifactComponentData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data.id).toBe(customId);
    });

    it('should create artifact component with only required fields', async () => {
      const tenantId = createTestTenantId('artifact-components-create-minimal');
      await ensureTestProject(tenantId, projectId);
      const minimalData = {
        id: `minimal-artifact-component-${nanoid(6)}`,
        name: 'MinimalArtifactComponent',
        description: 'Minimal test artifact component',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(minimalData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        name: minimalData.name,
        description: minimalData.description,
        tenantId,
      });
      expect(body.data.props).toBeNull();
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('artifact-components-create-validation');
      await ensureTestProject(tenantId, projectId);

      // Missing name
      const missingNameRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify({ description: 'Test description' }),
        }
      );
      expect(missingNameRes.status).toBe(400);

      // Missing description
      const missingDescRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Test name' }),
        }
      );
      expect(missingDescRes.status).toBe(400);

      // Empty body
      const emptyBodyRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      expect(emptyBodyRes.status).toBe(400);
    });

    it('should handle duplicate IDs gracefully', async () => {
      const tenantId = createTestTenantId('artifact-components-create-duplicate');
      await ensureTestProject(tenantId, projectId);
      const duplicateId = 'duplicate-artifact-component-id';
      const artifactComponentData = {
        ...createArtifactComponentData(),
        id: duplicateId,
      };

      // Create first artifact component
      const firstRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(artifactComponentData),
        }
      );
      expect(firstRes.status).toBe(201);

      // Try to create another with same ID
      const secondRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(artifactComponentData),
          expectError: true,
        }
      );
      expect(secondRes.status).toBe(409); // Conflict - duplicate ID
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing artifact component', async () => {
      const tenantId = createTestTenantId('artifact-components-update-success');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });

      const updateData = {
        name: 'UpdatedArtifactComponent',
        description: 'Updated description',
        props: {
          type: 'object',
          properties: {
            updatedField: { type: 'string', description: 'Updated field' },
          },
          required: ['updatedField'],
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: artifactComponentId,
        name: updateData.name,
        description: updateData.description,
        props: updateData.props,
        tenantId,
      });
    });

    it('should allow partial updates', async () => {
      const tenantId = createTestTenantId('artifact-components-update-partial');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentData, artifactComponentId } = await createTestArtifactComponent({
        tenantId,
      });

      const partialUpdate = {
        name: 'PartiallyUpdatedName',
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(partialUpdate),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: artifactComponentId,
        name: partialUpdate.name,
        description: artifactComponentData.description, // Should remain unchanged
        props: artifactComponentData.props, // Should remain unchanged
        tenantId,
      });
    });

    it('should return 404 for non-existent artifact component', async () => {
      const tenantId = createTestTenantId('artifact-components-update-not-found');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${nonExistentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Name' }),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should return 404 for artifact component in different tenant', async () => {
      const tenantId1 = createTestTenantId('artifact-components-update-tenant1');
      const tenantId2 = createTestTenantId('artifact-components-update-tenant2');

      const { artifactComponentId } = await createTestArtifactComponent({ tenantId: tenantId1 });

      // Try to update from different tenant
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Name' }),
        }
      );

      expect(res.status).toBe(404);
    });

    it('should handle empty update data', async () => {
      const tenantId = createTestTenantId('artifact-components-update-empty');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentData, artifactComponentId } = await createTestArtifactComponent({
        tenantId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: artifactComponentId,
        name: artifactComponentData.name,
        description: artifactComponentData.description,
        props: artifactComponentData.props,
        tenantId,
      });
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing artifact component', async () => {
      const tenantId = createTestTenantId('artifact-components-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });

      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify it's actually deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent artifact component', async () => {
      const tenantId = createTestTenantId('artifact-components-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${nonExistentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });

    it('should return 404 for artifact component in different tenant', async () => {
      const tenantId1 = createTestTenantId('artifact-components-delete-tenant1');
      const tenantId2 = createTestTenantId('artifact-components-delete-tenant2');

      const { artifactComponentId } = await createTestArtifactComponent({ tenantId: tenantId1 });

      // Try to delete from different tenant - still returns 404 but doesn't delete anything
      const res = await makeRequest(
        `/tenants/${tenantId2}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);

      // Verify the original item still exists in tenant1
      const verifyRes = await makeRequest(
        `/tenants/${tenantId1}/projects/${projectId}/artifact-components/${artifactComponentId}`
      );
      expect(verifyRes.status).toBe(200);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full artifact component lifecycle', async () => {
      const tenantId = createTestTenantId('artifact-components-e2e');
      await ensureTestProject(tenantId, projectId);

      // 1. Create artifact component
      const { artifactComponentId } = await createTestArtifactComponent({ tenantId });

      // 2. Get artifact component
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`
      );
      expect(getRes.status).toBe(200);

      // 3. Update artifact component
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated E2E Artifact Component' }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 4. List artifact components (should include our component)
      const listRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0].name).toBe('Updated E2E Artifact Component');

      // 5. Delete artifact component
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // 6. Verify deletion
      const finalGetRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid JSON schema in summaryProps', async () => {
      const tenantId = createTestTenantId('artifact-components-schema-valid');
      await ensureTestProject(tenantId, projectId);
      const validSchemaData = {
        id: `schema-test-component-${nanoid(6)}`,
        name: 'SchemaTestComponent',
        description: 'Testing valid JSON schema',
        props: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            count: { type: 'number', minimum: 0 },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['title'],
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(validSchemaData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.summaryProps).toEqual(validSchemaData.summaryProps);
    });

    it('should accept complex nested schemas in fullProps', async () => {
      const tenantId = createTestTenantId('artifact-components-schema-complex');
      await ensureTestProject(tenantId, projectId);
      const complexSchemaData = {
        id: `complex-schema-component-${nanoid(6)}`,
        name: 'ComplexSchemaComponent',
        description: 'Testing complex nested JSON schema',
        fullProps: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                profile: {
                  type: 'object',
                  properties: {
                    personal: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        age: { type: 'number', minimum: 0 },
                      },
                    },
                    professional: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        company: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          required: ['user'],
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/artifact-components`,
        {
          method: 'POST',
          body: JSON.stringify(complexSchemaData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.fullProps).toEqual(complexSchemaData.fullProps);
    });
  });
});
