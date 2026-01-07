import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/dbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('Dataset Items CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createDatasetItemData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    id: generateId(16),
    input: {
      messages: [{ role: 'user', content: `Test question${suffix}` }],
    },
    expectedOutput: {
      text: `Expected answer${suffix}`,
    },
    simulationAgent: null,
  });

  const createTestDataset = async ({ tenantId }: { tenantId: string }) => {
    const datasetData = {
      id: generateId(16),
      name: 'Test Dataset for Items',
    };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/evals/datasets`,
      {
        method: 'POST',
        body: JSON.stringify(datasetData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { datasetId: createBody.data.id };
  };

  const createTestDatasetItem = async ({
    tenantId,
    datasetId,
    suffix = '',
  }: {
    tenantId: string;
    datasetId: string;
    suffix?: string;
  }) => {
    const itemData = createDatasetItemData({ suffix });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items`,
      {
        method: 'POST',
        body: JSON.stringify(itemData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { itemData, itemId: createBody.data.id };
  };

  describe('GET /{datasetId}', () => {
    it('should list dataset items (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('items-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('should list dataset items after creation', async () => {
      const tenantId = await createTestTenantWithOrg('items-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      await createTestDatasetItem({ tenantId, datasetId, suffix: '-1' });
      await createTestDatasetItem({ tenantId, datasetId, suffix: '-2' });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('GET /{datasetId}/items/{itemId}', () => {
    it('should get a dataset item by id', async () => {
      const tenantId = await createTestTenantWithOrg('items-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { itemData, itemId } = await createTestDatasetItem({ tenantId, datasetId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(itemId);
      expect(body.data.input).toEqual(itemData.input);
    });

    it('should return 404 when item not found', async () => {
      const tenantId = await createTestTenantWithOrg('items-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /{datasetId}/items', () => {
    it('should create a new dataset item', async () => {
      const tenantId = await createTestTenantWithOrg('items-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const itemData = createDatasetItemData();

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items`,
        {
          method: 'POST',
          body: JSON.stringify(itemData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.input).toEqual(itemData.input);
      expect(body.data.tenantId).toBe(tenantId);
      expect(body.data.datasetId).toBe(datasetId);
    });

    it('should create item with minimal data', async () => {
      const tenantId = await createTestTenantWithOrg('items-create-minimal');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const minimalData = {
        input: { messages: [{ role: 'user', content: 'Hello' }] },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items`,
        {
          method: 'POST',
          body: JSON.stringify(minimalData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.input).toEqual(minimalData.input);
    });
  });

  describe('POST /{datasetId}/items/bulk', () => {
    it('should create multiple dataset items', async () => {
      const tenantId = await createTestTenantWithOrg('items-bulk-create');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const bulkItems = [
        createDatasetItemData({ suffix: '-bulk-1' }),
        createDatasetItemData({ suffix: '-bulk-2' }),
        createDatasetItemData({ suffix: '-bulk-3' }),
      ];

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/bulk`,
        {
          method: 'POST',
          body: JSON.stringify(bulkItems),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toHaveLength(3);
      expect(body.pagination.total).toBe(3);
    });

    it('should handle large bulk creation', async () => {
      const tenantId = await createTestTenantWithOrg('items-bulk-large');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const bulkItems = Array.from({ length: 20 }, (_, i) =>
        createDatasetItemData({ suffix: `-large-${i}` })
      );

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/bulk`,
        {
          method: 'POST',
          body: JSON.stringify(bulkItems),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toHaveLength(20);
    });
  });

  describe('PATCH /{datasetId}/items/{itemId}', () => {
    it('should update an existing dataset item', async () => {
      const tenantId = await createTestTenantWithOrg('items-update-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { itemId } = await createTestDatasetItem({ tenantId, datasetId });
      const updateData = {
        input: { messages: [{ role: 'user', content: 'Updated question' }] },
        expectedOutput: { text: 'Updated expected answer' },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.input).toEqual(updateData.input);
      expect(body.data.id).toBe(itemId);
    });

    it('should return 404 when item not found for update', async () => {
      const tenantId = await createTestTenantWithOrg('items-update-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/non-existent-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({ input: { messages: [{ role: 'user', content: 'test' }] } }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{datasetId}/items/{itemId}', () => {
    it('should delete an existing dataset item', async () => {
      const tenantId = await createTestTenantWithOrg('items-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { itemId } = await createTestDatasetItem({ tenantId, datasetId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when item not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('items-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full dataset item lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('items-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      // 1. Create item
      const { itemId } = await createTestDatasetItem({ tenantId, datasetId });

      // 2. Get item
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`
      );
      expect(getRes.status).toBe(200);

      // 3. Update item
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ input: { messages: [{ role: 'user', content: 'Updated' }] } }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 4. List items (should include our item)
      const listRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 5. Delete item
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // 6. Verify deletion
      const finalGetRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items/${itemId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});

