import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

describe('Context Config CRUD Routes - Integration Tests', () => {
  const projectId = 'default';
  const testGraphId = 'test-graph';

  // Helper function to create a test graph for context configs
  const createTestGraph = async ({ tenantId }: { tenantId: string }) => {
    const graphData = {
      id: testGraphId,
      name: 'Test Graph',
      description: 'Test graph for context config tests',
      defaultAgentId: 'test-agent',
      agents: {
        'test-agent': {
          id: 'test-agent',
          type: 'internal',
          name: 'Test Agent',
          description: 'Test agent',
          prompt: 'You are a test agent',
          canUse: [],
        },
      },
    };

    const createRes = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/graph`, {
      method: 'POST',
      body: JSON.stringify(graphData),
    });

    if (createRes.status !== 201) {
      const errorBody = await createRes.json();
      throw new Error(`Failed to create test graph: ${JSON.stringify(errorBody)}`);
    }
  };

  // Helper function to create test context config data
  const createContextConfigData = ({
    suffix = '',
    tenantId = 'default-tenant',
    projectId = 'default',
    graphId = 'test-graph',
  }: {
    suffix?: string;
    tenantId?: string;
    projectId?: string;
    graphId?: string;
  } = {}) => ({
    id: `test-context-config${suffix.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`,
    tenantId,
    projectId,
    graphId,
    headersSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User identifier' },
        sessionToken: { type: 'string', description: 'Session token' },
      },
      required: ['userId'],
    },
    contextVariables: {
      userProfile: {
        id: `user-profile${suffix}`,
        name: `User Profile${suffix}`,
        trigger: 'initialization',
        fetchConfig: {
          url: 'https://api.example.com/users/{{headers.userId}}',
          method: 'GET',
          headers: {
            Authorization: 'Bearer {{headers.sessionToken}}',
          },
        },
        defaultValue: { name: 'Anonymous User' },
      },
    },
  });

  // Helper function to create a context config and return its ID
  const createTestContextConfig = async ({
    tenantId,
    suffix = '',
    skipGraphCreation = false,
  }: {
    tenantId: string;
    suffix?: string;
    skipGraphCreation?: boolean;
  }) => {
    // Create test graph first (unless skipped)
    if (!skipGraphCreation) {
      try {
        await createTestGraph({ tenantId });
      } catch (_e) {
        // Graph might already exist, that's ok
      }
    }

    const contextConfigData = createContextConfigData({
      suffix,
      tenantId,
      projectId,
      graphId: testGraphId,
    });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
      {
        method: 'POST',
        body: JSON.stringify(contextConfigData),
      }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { contextConfigData, contextConfigId: createBody.data.id };
  };

  // Helper function to create multiple context configs
  const createMultipleContextConfigs = async ({
    tenantId,
    count,
  }: {
    tenantId: string;
    count: number;
  }) => {
    const contextConfigs: Awaited<ReturnType<typeof createTestContextConfig>>[] = [];
    for (let i = 1; i <= count; i++) {
      // Only create graph on first iteration
      const contextConfig = await createTestContextConfig({
        tenantId,
        suffix: ` ${i}`,
        skipGraphCreation: i > 1,
      });
      contextConfigs.push(contextConfig);
    }
    return contextConfigs;
  };

  describe('GET /', () => {
    it('should list context configs with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('context-configs-list-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs?page=1&limit=10`
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

    it('should list context configs with pagination (single item)', async () => {
      const tenantId = createTestTenantId('context-configs-list-single');
      await ensureTestProject(tenantId, projectId);
      const { contextConfigData } = await createTestContextConfig({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs?page=1&limit=10`
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        headersSchema: contextConfigData.headersSchema,
        contextVariables: contextConfigData.contextVariables,
      });
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        pages: 1,
      });
    });

    it('should handle pagination with multiple pages', async () => {
      const tenantId = createTestTenantId('context-configs-list-multipages');
      await ensureTestProject(tenantId, projectId);
      const _contextConfigs = await createMultipleContextConfigs({ tenantId, count: 5 });

      // Test first page with limit 2
      const page1Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs?page=1&limit=2`
      );
      expect(page1Res.status).toBe(200);

      const page1Body = await page1Res.json();
      expect(page1Body.data).toHaveLength(2);
      expect(page1Body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Test second page
      const page2Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs?page=2&limit=2`
      );
      expect(page2Res.status).toBe(200);

      const page2Body = await page2Res.json();
      expect(page2Body.data).toHaveLength(2);
      expect(page2Body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Test third page (partial)
      const page3Res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs?page=3&limit=2`
      );
      expect(page3Res.status).toBe(200);

      const page3Body = await page3Res.json();
      expect(page3Body.data).toHaveLength(1); // Only 1 item on last page
      expect(page3Body.pagination).toEqual({
        page: 3,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Verify all context configs are unique across pages
      const allContextConfigIds = [
        ...page1Body.data.map((c: any) => c.id),
        ...page2Body.data.map((c: any) => c.id),
        ...page3Body.data.map((c: any) => c.id),
      ];
      expect(new Set(allContextConfigIds).size).toBe(5); // All should be unique
    });

    it('should return empty data for page beyond available data', async () => {
      const tenantId = createTestTenantId('context-configs-list-beyond-pages');
      await ensureTestProject(tenantId, projectId);
      await createMultipleContextConfigs({ tenantId, count: 3 });

      // Request page 5 with limit 2 (should be empty)
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs?page=5&limit=2`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(0);
      expect(body.pagination).toEqual({
        page: 5,
        limit: 2,
        total: 3,
        pages: 2, // Only 2 pages available
      });
    });

    it('should handle large page size (larger than total items)', async () => {
      const tenantId = createTestTenantId('context-configs-list-large-limit');
      await ensureTestProject(tenantId, projectId);
      const _contextConfigs = await createMultipleContextConfigs({ tenantId, count: 3 });

      // Request with limit 10 (larger than total)
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(3); // All 3 context configs
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        pages: 1, // Only 1 page needed
      });
    });
  });

  describe('GET /{id}', () => {
    it('should get a context config by id', async () => {
      const tenantId = createTestTenantId('context-configs-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { contextConfigData, contextConfigId } = await createTestContextConfig({
        tenantId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: contextConfigId,
        headersSchema: contextConfigData.headersSchema,
        contextVariables: contextConfigData.contextVariables,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should return 404 when context config not found', async () => {
      const tenantId = createTestTenantId('context-configs-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/non-existent-id`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'Context configuration not found',
        error: {
          code: 'not_found',
          message: 'Context configuration not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should return RFC 7807-compliant problem details JSON and header for 404', async () => {
      const tenantId = createTestTenantId('context-configs-problem-details-404');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/non-existent-id`
      );
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);

      const body = await res.json();
      // RFC 7807 required fields
      expect(typeof body.type === 'string' || body.type === undefined).toBe(true);
      expect(typeof body.title).toBe('string');
      expect(typeof body.status).toBe('number');
      expect(typeof body.detail).toBe('string');
      if (body.instance !== undefined) {
        expect(typeof body.instance).toBe('string');
      }
    });
  });

  describe('POST /', () => {
    it('should create a new context config', async () => {
      const tenantId = createTestTenantId('context-configs-create-success');
      await ensureTestProject(tenantId, projectId);
      await createTestGraph({ tenantId });
      const contextConfigData = createContextConfigData({ tenantId, projectId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
        {
          method: 'POST',
          body: JSON.stringify(contextConfigData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        headersSchema: contextConfigData.headersSchema,
        contextVariables: contextConfigData.contextVariables,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should create a new context config with minimal required fields', async () => {
      const tenantId = createTestTenantId('context-configs-create-minimal');
      await ensureTestProject(tenantId, projectId);
      await createTestGraph({ tenantId });
      const minimalData = {
        id: `minimal-context-config-${nanoid(6)}`,
        tenantId,
        projectId,
        graphId: testGraphId,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
        {
          method: 'POST',
          body: JSON.stringify(minimalData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({});
      expect(body.data.headersSchema).toBeNull();
      expect(body.data.contextVariables).toBeNull();
    });

    it('should create a context config with complex fetch definitions', async () => {
      const tenantId = createTestTenantId('context-configs-create-complex');
      await ensureTestProject(tenantId, projectId);
      await createTestGraph({ tenantId });
      const complexData = {
        id: `complex-context-config-${nanoid(6)}`,
        tenantId,
        projectId,
        graphId: testGraphId,
        headersSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            orgId: { type: 'string' },
            permissions: { type: 'array', items: { type: 'string' } },
          },
          required: ['userId', 'orgId'],
        },
        contextVariables: {
          userProfile: {
            id: 'user-profile',
            name: 'User Profile',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/users/{{headers.userId}}',
              method: 'GET',
              headers: { Authorization: 'Bearer token' },
              timeout: 5000,
            },
            defaultValue: { name: 'Unknown User' },
          },
          orgSettings: {
            id: 'org-settings',
            name: 'Organization Settings',
            trigger: 'invocation',
            fetchConfig: {
              url: 'https://api.example.com/orgs/{{headers.orgId}}/settings',
              method: 'GET',
            },
            defaultValue: { theme: 'default' },
          },
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
        {
          method: 'POST',
          body: JSON.stringify(complexData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject(complexData);
      expect(Object.keys(body.data.contextVariables)).toHaveLength(2);
    });

    it('should fail to create context config without context variables or headers schema', async () => {
      const tenantId = createTestTenantId('context-configs-create-minimal');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing context config', async () => {
      const tenantId = createTestTenantId('context-configs-update-success');
      await ensureTestProject(tenantId, projectId);
      const { contextConfigId } = await createTestContextConfig({ tenantId });

      const updateData = {
        headersSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'Updated user identifier' },
            newField: { type: 'string', description: 'New field' },
          },
          required: ['userId'],
        },
        contextVariables: {
          userProfile: {
            id: 'updated-profile',
            name: 'Updated User Profile',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/v2/users/{{headers.userId}}',
              method: 'GET',
              headers: {
                Authorization: 'Bearer {{headers.token}}',
                'X-Version': '2.0',
              },
            },
            defaultValue: { name: 'Updated Anonymous User' },
          },
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: contextConfigId,
        headersSchema: updateData.headersSchema,
        contextVariables: updateData.contextVariables,
      });
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing context config', async () => {
      const tenantId = createTestTenantId('context-configs-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { contextConfigId } = await createTestContextConfig({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify the context config is deleted
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent context config', async () => {
      const tenantId = createTestTenantId('context-configs-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/non-existent-id`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('Edge Cases and Data Validation', () => {
    it('should handle context config with empty context variables object', async () => {
      const tenantId = createTestTenantId('context-configs-empty-context-vars');
      await ensureTestProject(tenantId, projectId);
      await createTestGraph({ tenantId });
      const configData = {
        id: `empty-context-vars-${nanoid(6)}`,
        tenantId,
        projectId,
        graphId: testGraphId,
        contextVariables: {},
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.contextVariables).toBeNull();
    });

    it('should handle context config with null headersSchema', async () => {
      const tenantId = createTestTenantId('context-configs-null-headers-schema');
      await ensureTestProject(tenantId, projectId);
      await createTestGraph({ tenantId });
      const configData = {
        id: `null-headers-schema-${nanoid(6)}`,
        tenantId,
        projectId,
        graphId: testGraphId,
        headersSchema: null,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.headersSchema).toBeNull();
    });

    it('should preserve complex nested data structures', async () => {
      const tenantId = createTestTenantId('context-configs-complex-nested');
      await ensureTestProject(tenantId, projectId);
      await createTestGraph({ tenantId });
      const complexConfig = {
        id: `complex-nested-config-${nanoid(6)}`,
        tenantId,
        projectId,
        graphId: testGraphId,
        headersSchema: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                profile: {
                  type: 'object',
                  properties: {
                    preferences: {
                      type: 'object',
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
        },
        contextVariables: {
          complexData: {
            id: 'nested-fetch',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/complex',
              method: 'POST',
              body: {
                query: {
                  nested: {
                    field: '{{headers.user.profile.id}}',
                  },
                },
              },
              headers: {
                'Content-Type': 'application/json',
              },
            },
            defaultValue: {
              nested: {
                array: [1, 2, 3],
                object: { key: 'value' },
              },
            },
          },
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
        {
          method: 'POST',
          body: JSON.stringify(complexConfig),
        }
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toMatchObject(complexConfig);
    });
  });

  describe('Property Removal and Clearing Functionality', () => {
    describe('Context Variables Removal', () => {
      it('should clear contextVariables when set to null via update', async () => {
        const tenantId = createTestTenantId('context-configs-clear-context-vars-null');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({ tenantId });

        // Update to clear contextVariables with null
        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify({ contextVariables: null }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.contextVariables).toBeNull();
      });

      it('should clear contextVariables when set to empty object via update', async () => {
        const tenantId = createTestTenantId('context-configs-clear-context-vars-empty');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({ tenantId });

        // Update to clear contextVariables with empty object
        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify({ contextVariables: {} }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.contextVariables).toBeNull();
      });

      it('should create with empty contextVariables treated as null', async () => {
        const tenantId = createTestTenantId('context-configs-create-empty-context-vars');
        await ensureTestProject(tenantId, projectId);
        await createTestGraph({ tenantId });
        const configData = {
          id: `empty-context-vars-config-${nanoid(6)}`,
          tenantId,
          projectId,
          graphId: testGraphId,
          contextVariables: {},
        };

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
          {
            method: 'POST',
            body: JSON.stringify(configData),
          }
        );

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.contextVariables).toBeNull();
      });

      it('should preserve non-empty contextVariables', async () => {
        const tenantId = createTestTenantId('context-configs-preserve-context-vars');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({
          tenantId,
        });

        // Update to modify but not clear contextVariables
        const updateData = {
          contextVariables: {
            newVar: {
              id: 'new-var',
              trigger: 'invocation',
              fetchConfig: {
                url: 'https://api.example.com/new',
                method: 'GET',
              },
              defaultValue: { value: 'new' },
            },
          },
        };

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify(updateData),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.contextVariables).toEqual(updateData.contextVariables);
        expect(body.data.contextVariables).not.toBeNull();
      });
    });

    describe('Request Context Schema Removal', () => {
      it('should clear headersSchema when set to null via update', async () => {
        const tenantId = createTestTenantId('context-configs-clear-request-schema-null');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({ tenantId });

        // Update to clear headersSchema with null
        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify({ headersSchema: null }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.headersSchema).toBeNull();
      });

      it('should create with headersSchema as null', async () => {
        const tenantId = createTestTenantId('context-configs-create-null-request-schema');
        await ensureTestProject(tenantId, projectId);
        await createTestGraph({ tenantId });
        const configData = {
          id: `null-request-schema-config-${nanoid(6)}`,
          tenantId,
          projectId,
          graphId: testGraphId,
          headersSchema: null,
        };

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
          {
            method: 'POST',
            body: JSON.stringify(configData),
          }
        );

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.headersSchema).toBeNull();
      });

      it('should preserve non-null headersSchema', async () => {
        const tenantId = createTestTenantId('context-configs-preserve-request-schema');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({ tenantId });

        // Update to modify but not clear headersSchema
        const updateData = {
          headersSchema: {
            type: 'object',
            properties: {
              newField: { type: 'string' },
            },
            required: ['newField'],
          },
        };

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify(updateData),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.headersSchema).toEqual(updateData.headersSchema);
        expect(body.data.headersSchema).not.toBeNull();
      });
    });

    describe('Combined Field Clearing', () => {
      it('should clear both contextVariables and headersSchema simultaneously', async () => {
        const tenantId = createTestTenantId('context-configs-clear-both-fields');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({ tenantId });

        // Update to clear both fields
        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              contextVariables: null,
              headersSchema: null,
            }),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.contextVariables).toBeNull();
        expect(body.data.headersSchema).toBeNull();
      });

      it('should handle mixed clearing and updating of fields', async () => {
        const tenantId = createTestTenantId('context-configs-mixed-clear-update');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({ tenantId });

        // Clear contextVariables but update headersSchema
        const updateData = {
          contextVariables: null,
          headersSchema: {
            type: 'object',
            properties: {
              mixedField: { type: 'boolean' },
            },
          },
        };

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify(updateData),
          }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.contextVariables).toBeNull();
        expect(body.data.headersSchema).toEqual(updateData.headersSchema);
      });
    });

    describe('Default Values and Consistency', () => {
      it('should handle creation with minimal data and consistent null defaults', async () => {
        const tenantId = createTestTenantId('context-configs-minimal-with-nulls');
        await ensureTestProject(tenantId, projectId);
        await createTestGraph({ tenantId });
        const minimalData = {
          id: `minimal-null-defaults-config-${nanoid(6)}`,
          tenantId,
          projectId,
          graphId: testGraphId,
          name: 'Minimal Config',
          description: 'Minimal config with no optional fields',
        };

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
          {
            method: 'POST',
            body: JSON.stringify(minimalData),
          }
        );

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.contextVariables).toBeNull();
        expect(body.data.headersSchema).toBeNull();
      });

      it('should retrieve cleared fields as null consistently', async () => {
        const tenantId = createTestTenantId('context-configs-consistent-null-retrieval');
        await ensureTestProject(tenantId, projectId);
        const { contextConfigId } = await createTestContextConfig({ tenantId });

        // Clear both fields
        await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              contextVariables: null,
              headersSchema: null,
            }),
          }
        );

        // Retrieve and verify null values
        const getRes = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'GET',
          }
        );

        expect(getRes.status).toBe(200);
        const body = await getRes.json();
        expect(body.data.contextVariables).toBeNull();
        expect(body.data.headersSchema).toBeNull();
      });

      it('should list configs with null fields correctly', async () => {
        const tenantId = createTestTenantId('context-configs-list-with-nulls');
        await ensureTestProject(tenantId, projectId);

        // Create config and clear its fields
        const { contextConfigId } = await createTestContextConfig({ tenantId });
        await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs/${contextConfigId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              contextVariables: null,
              headersSchema: null,
            }),
          }
        );

        // List and verify
        const listRes = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/graphs/${testGraphId}/context-configs`,
          {
            method: 'GET',
          }
        );

        expect(listRes.status).toBe(200);
        const body = await listRes.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].contextVariables).toBeNull();
        expect(body.data[0].headersSchema).toBeNull();
      });
    });
  });
});
