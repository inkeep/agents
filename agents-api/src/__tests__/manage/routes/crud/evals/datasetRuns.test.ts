import { createDatasetRun, generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../../data/db/manageDbClient';
import runDbClient from '../../../../../data/db/runDbClient';
import { makeRequest } from '../../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../../utils/testTenant';

describe('Dataset Runs Routes - Integration Tests', () => {
  const projectId = 'default';

  const createTestDataset = async ({ tenantId }: { tenantId: string }) => {
    const datasetData = {
      id: generateId(16),
      name: 'Test Dataset for Runs',
    };
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`,
      {
        method: 'POST',
        body: JSON.stringify(datasetData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { datasetId: createBody.data.id };
  };

  const createTestDatasetRun = async ({
    tenantId,
    datasetId,
  }: {
    tenantId: string;
    datasetId: string;
  }) => {
    const runId = generateId(16);
    await createDatasetRun(runDbClient)({
      id: runId,
      tenantId,
      projectId,
      datasetId,
      datasetRunConfigId: undefined as any,
      evaluationJobConfigId: undefined,
    });
    return { runId };
  };

  describe('GET /by-dataset/{datasetId}', () => {
    it.skip('should list dataset runs (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('runs-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/by-dataset/${datasetId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it.skip('should list dataset runs after creation', async () => {
      const tenantId = await createTestTenantWithOrg('runs-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      await createTestDatasetRun({ tenantId, datasetId });
      await createTestDatasetRun({ tenantId, datasetId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/by-dataset/${datasetId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
    });

    it.skip('should not include runs from other datasets', async () => {
      const tenantId = await createTestTenantWithOrg('runs-list-filtered');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId: dataset1 } = await createTestDataset({ tenantId });
      const { datasetId: dataset2 } = await createTestDataset({ tenantId });
      await createTestDatasetRun({ tenantId, datasetId: dataset1 });
      await createTestDatasetRun({ tenantId, datasetId: dataset2 });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/by-dataset/${dataset1}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].datasetId).toBe(dataset1);
    });
  });

  describe('GET /{runId}', () => {
    it.skip('should get a dataset run by id', async () => {
      const tenantId = await createTestTenantWithOrg('runs-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { runId } = await createTestDatasetRun({ tenantId, datasetId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/${runId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(runId);
      expect(body.data.datasetId).toBe(datasetId);
      expect(body.data.conversations).toBeDefined();
      expect(body.data.items).toBeDefined();
    });

    it.skip('should return 404 when run not found', async () => {
      const tenantId = await createTestTenantWithOrg('runs-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it.skip('should complete workflow for viewing dataset runs', async () => {
      const tenantId = await createTestTenantWithOrg('runs-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create dataset
      const { datasetId } = await createTestDataset({ tenantId });

      // 2. Create dataset items
      const itemRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-items/${datasetId}/items`,
        {
          method: 'POST',
          body: JSON.stringify({
            input: { messages: [{ role: 'user', content: 'Test question' }] },
          }),
        }
      );
      expect(itemRes.status).toBe(201);

      // 3. Create a dataset run (simulating what would happen from trigger)
      const { runId } = await createTestDatasetRun({ tenantId, datasetId });

      // 4. List runs for dataset
      const listRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/by-dataset/${datasetId}`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 5. Get specific run details
      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/${runId}`
      );
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.id).toBe(runId);
      expect(getBody.data.datasetId).toBe(datasetId);
      // Should have items from the dataset
      expect(getBody.data.items).toBeDefined();
    });
  });
});
