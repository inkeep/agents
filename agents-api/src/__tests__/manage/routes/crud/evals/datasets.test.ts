import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../../data/db/manageDbClient';
import { makeRequest } from '../../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../../utils/testTenant';

describe('Datasets CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createDatasetData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    id: generateId(16),
    name: `Test Dataset${suffix}`,
    description: `Test dataset description${suffix}`,
    metadata: {
      tags: ['test', 'integration'],
      source: 'unit-test',
    },
  });

  const createTestDataset = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const datasetData = createDatasetData({ suffix });
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`,
      {
        method: 'POST',
        body: JSON.stringify(datasetData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { datasetData, datasetId: createBody.data.id };
  };

  describe('GET /', () => {
    it('should list datasets with pagination (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('should list datasets after creation', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      await createTestDataset({ tenantId, suffix: '-1' });
      await createTestDataset({ tenantId, suffix: '-2' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('GET /{datasetId}', () => {
    it('should get a dataset by id', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetData, datasetId } = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(datasetId);
      expect(body.data.name).toBe(datasetData.name);
    });

    it('should return 404 when dataset not found', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new dataset', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetData = createDatasetData();

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`,
        {
          method: 'POST',
          body: JSON.stringify(datasetData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe(datasetData.name);
      expect(body.data.tenantId).toBe(tenantId);
    });

    it('should create dataset with minimal data', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-create-minimal');
      await createTestProject(manageDbClient, tenantId, projectId);
      const minimalData = {
        name: 'Minimal Dataset',
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`,
        {
          method: 'POST',
          body: JSON.stringify(minimalData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe(minimalData.name);
    });
  });

  describe('PATCH /{datasetId}', () => {
    it('should update an existing dataset', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-update-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const updateData = {
        name: 'Updated Dataset Name',
        description: 'Updated description',
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Dataset Name');
      expect(body.data.id).toBe(datasetId);
    });

    it('should return 404 when dataset not found for update', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-update-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/non-existent-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{datasetId}', () => {
    it('should delete an existing dataset', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when dataset not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full dataset lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('datasets-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create dataset
      const { datasetId } = await createTestDataset({ tenantId });

      // 2. Get dataset
      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`
      );
      expect(getRes.status).toBe(200);

      // 3. Update dataset
      const updateRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Dataset' }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 4. List datasets (should include our dataset)
      const listRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 5. Delete dataset
      const deleteRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // 6. Verify deletion
      const finalGetRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});
