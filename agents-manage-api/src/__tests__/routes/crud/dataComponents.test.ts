import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import app from '../../../index';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

describe('Data Component CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test data component data
  const createDataComponentData = ({ suffix = '' } = {}) => ({
    id: `test-component${suffix.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`,
    name: `TestComponent${suffix}`,
    description: `Test Description${suffix}`,
    props: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' },
          description: `Test items${suffix}`,
        },
      },
      required: ['items'],
    },
  });

  // Helper function to create a data component and return its ID
  const createTestDataComponent = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const dataComponentData = createDataComponentData({ suffix });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/crud/projects/${projectId}/data-components`,
      {
        method: 'POST',
        body: JSON.stringify(dataComponentData),
      }
    );

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { dataComponentData, dataComponentId: createBody.data.id };
  };

  // Helper function to create multiple data components
  const createMultipleDataComponents = async ({
    tenantId,
    count,
  }: {
    tenantId: string;
    count: number;
  }) => {
    const dataComponents: Awaited<ReturnType<typeof createTestDataComponent>>[] = [];
    for (let i = 1; i <= count; i++) {
      const dataComponent = await createTestDataComponent({ tenantId, suffix: ` ${i}` });
      dataComponents.push(dataComponent);
    }
    return dataComponents;
  };

  describe('GET /', () => {
    it('should list data components with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('data-components-list-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=1&limit=10`
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

    it('should list data components with pagination (single item)', async () => {
      const tenantId = createTestTenantId('data-components-list-single');
      await ensureTestProject(tenantId, projectId);
      const { dataComponentData } = await createTestDataComponent({ tenantId });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        name: dataComponentData.name,
        description: dataComponentData.description,
        props: dataComponentData.props,
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
      const tenantId = createTestTenantId('data-components-list-multipages');
      await ensureTestProject(tenantId, projectId);
      const dataComponents = await createMultipleDataComponents({ tenantId, count: 5 });

      // Test first page with limit 2
      const page1Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=1&limit=2`
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
      const page2Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=2&limit=2`
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
      const page3Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=3&limit=2`
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

      // Verify all data components are unique across pages
      const allDataComponentIds = [
        ...page1Body.data.map((dc) => dc.id),
        ...page2Body.data.map((dc) => dc.id),
        ...page3Body.data.map((dc) => dc.id),
      ];
      expect(new Set(allDataComponentIds).size).toBe(5); // All should be unique
    });

    it('should return empty data for page beyond available data', async () => {
      const tenantId = createTestTenantId('data-components-list-beyond-pages');
      await ensureTestProject(tenantId, projectId);
      await createMultipleDataComponents({ tenantId, count: 3 });

      // Request page 5 with limit 2 (should be empty)
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=5&limit=2`
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

    it('should handle edge case with limit 1', async () => {
      const tenantId = createTestTenantId('data-components-list-limit1');
      await ensureTestProject(tenantId, projectId);
      const dataComponents = await createMultipleDataComponents({ tenantId, count: 3 });

      // Test with limit 1 (each page should have exactly 1 item)
      const page1Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=1&limit=1`
      );
      expect(page1Res.status).toBe(200);

      const page1Body = await page1Res.json();
      expect(page1Body.data).toHaveLength(1);
      expect(page1Body.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 3,
        pages: 3,
      });

      // Test middle page
      const page2Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=2&limit=1`
      );
      expect(page2Res.status).toBe(200);

      const page2Body = await page2Res.json();
      expect(page2Body.data).toHaveLength(1);
      expect(page2Body.pagination).toEqual({
        page: 2,
        limit: 1,
        total: 3,
        pages: 3,
      });

      // Test last page
      const page3Res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=3&limit=1`
      );
      expect(page3Res.status).toBe(200);

      const page3Body = await page3Res.json();
      expect(page3Body.data).toHaveLength(1);
      expect(page3Body.pagination).toEqual({
        page: 3,
        limit: 1,
        total: 3,
        pages: 3,
      });
    });

    it('should handle large page size (larger than total items)', async () => {
      const tenantId = createTestTenantId('data-components-list-large-limit');
      await ensureTestProject(tenantId, projectId);
      const dataComponents = await createMultipleDataComponents({ tenantId, count: 3 });

      // Request with limit 10 (larger than total)
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(3); // All 3 data components
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        pages: 1, // Only 1 page needed
      });
    });
  });

  describe('GET /{id}', () => {
    it('should get a data component by id', async () => {
      const tenantId = createTestTenantId('data-components-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { dataComponentData, dataComponentId } = await createTestDataComponent({
        tenantId,
      });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/${dataComponentId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: dataComponentId,
        name: dataComponentData.name,
        description: dataComponentData.description,
        props: dataComponentData.props,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should return 404 when data component not found', async () => {
      const tenantId = createTestTenantId('data-components-get-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/non-existent-id`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body).toEqual({
        code: 'not_found',
        detail: 'Data component not found',
        error: {
          code: 'not_found',
          message: 'Data component not found',
        },
        status: 404,
        title: 'Not Found',
      });
    });

    it('should return RFC 7807-compliant problem details JSON and header for 404', async () => {
      const tenantId = createTestTenantId('data-components-problem-details-404');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/non-existent-id`
      );
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);

      const body = await res.json();
      // RFC 7807 required fields
      expect(typeof body.type === 'string' || body.type === undefined).toBe(true); // type is string or omitted (defaults to about:blank)
      expect(typeof body.title).toBe('string');
      expect(typeof body.status).toBe('number');
      expect(typeof body.detail).toBe('string');
      // instance is optional
      if (body.instance !== undefined) {
        expect(typeof body.instance).toBe('string');
      }
      // Custom fields allowed, but must not break the spec
    });
  });

  describe('POST /', () => {
    it('should create a new data component', async () => {
      const tenantId = createTestTenantId('data-components-create-success');
      await ensureTestProject(tenantId, projectId);
      const dataComponentData = createDataComponentData();

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components`,
        {
          method: 'POST',
          body: JSON.stringify(dataComponentData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        name: dataComponentData.name,
        description: dataComponentData.description,
        props: dataComponentData.props,
        tenantId,
      });
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });

    it('should create a new data component with a provided id', async () => {
      const tenantId = createTestTenantId('data-components-create-with-id');
      await ensureTestProject(tenantId, projectId);
      const dataComponentData = createDataComponentData();
      const providedId = nanoid();

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components`,
        {
          method: 'POST',
          body: JSON.stringify({ ...dataComponentData, id: providedId }),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: providedId,
        name: dataComponentData.name,
        description: dataComponentData.description,
        props: dataComponentData.props,
        tenantId,
      });

      // Verify the data component can be fetched with the provided ID
      const getRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/${providedId}`
      );
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.id).toBe(providedId);
    });

    it('should validate required fields', async () => {
      const tenantId = createTestTenantId('data-components-create-validation');
      await ensureTestProject(tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
    });

    it('should handle complex props structure', async () => {
      const tenantId = createTestTenantId('data-components-create-complex-props');
      await ensureTestProject(tenantId, projectId);
      const complexDataComponentData = {
        id: `complex-component-${nanoid(6)}`,
        name: 'ComplexComponent',
        description: 'A complex data component with nested props',
        props: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  metadata: {
                    type: 'object',
                    properties: {
                      tags: { type: 'array', items: { type: 'string' } },
                      priority: { type: 'number' },
                    },
                  },
                },
                required: ['id', 'name'],
              },
            },
            config: {
              type: 'object',
              properties: {
                theme: { type: 'string', enum: ['light', 'dark'] },
                sortBy: { type: 'string', default: 'name' },
              },
            },
          },
          required: ['items'],
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components`,
        {
          method: 'POST',
          body: JSON.stringify(complexDataComponentData),
        }
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.data).toMatchObject({
        name: complexDataComponentData.name,
        description: complexDataComponentData.description,
        props: complexDataComponentData.props,
        tenantId,
      });
    });
  });

  describe('PUT /{id}', () => {
    it('should update an existing data component', async () => {
      const tenantId = createTestTenantId('data-components-update-success');
      await ensureTestProject(tenantId, projectId);
      const { dataComponentId } = await createTestDataComponent({ tenantId });

      const updateData = {
        name: 'Updated Component',
        description: 'Updated Description',
        props: {
          type: 'object',
          properties: {
            updatedItems: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated items',
            },
          },
          required: ['updatedItems'],
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/${dataComponentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: dataComponentId,
        name: updateData.name,
        description: updateData.description,
        props: updateData.props,
        tenantId,
      });
    });

    it('should return 404 when updating non-existent data component', async () => {
      const tenantId = createTestTenantId('data-components-update-not-found');
      await ensureTestProject(tenantId, projectId);
      const updateData = {
        name: 'Updated Component',
        description: 'Updated Description',
        props: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['items'],
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/non-existent-id`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{id}', () => {
    it('should delete an existing data component', async () => {
      const tenantId = createTestTenantId('data-components-delete-success');
      await ensureTestProject(tenantId, projectId);
      const { dataComponentId } = await createTestDataComponent({ tenantId });

      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/${dataComponentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(204);

      // Verify the data component is deleted
      const getRes = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/${dataComponentId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent data component', async () => {
      const tenantId = createTestTenantId('data-components-delete-not-found');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/crud/projects/${projectId}/data-components/non-existent-id`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
