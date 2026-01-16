import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it, vi } from 'vitest';
import manageDbClient from '../../../../../data/db/manageDbClient';
import { makeRequest } from '../../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../../utils/testTenant';

// Mock the EvalApiClient to prevent actual API calls
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    EvalApiClient: vi.fn().mockImplementation(() => ({
      triggerDatasetRun: vi.fn().mockResolvedValue({
        queued: 0,
        failed: 0,
      }),
    })),
  };
});

describe('Dataset Run Configs CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createTestDataset = async ({ tenantId }: { tenantId: string }) => {
    const datasetData = {
      id: generateId(16),
      name: 'Test Dataset for Run Config',
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

  const createTestAgent = async ({ tenantId }: { tenantId: string }) => {
    const agentData = {
      id: generateId(16),
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
    };
    const createRes = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { agentId: createBody.data.id };
  };

  const createRunConfigData = ({
    datasetId,
    suffix = '',
  }: {
    datasetId: string;
    suffix?: string;
  }): any => ({
    id: generateId(16),
    name: `Test Run Config${suffix}`,
    description: `Test run configuration${suffix}`,
    datasetId,
  });

  const createTestRunConfig = async ({
    tenantId,
    datasetId,
    suffix = '',
    agentIds = [],
    evaluatorIds = [],
  }: {
    tenantId: string;
    datasetId: string;
    suffix?: string;
    agentIds?: string[];
    evaluatorIds?: string[];
  }) => {
    const configData = { ...createRunConfigData({ datasetId, suffix }), agentIds, evaluatorIds };
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs`,
      {
        method: 'POST',
        body: JSON.stringify(configData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { configData, configId: createBody.data.id };
  };

  describe('GET /by-dataset/{datasetId}', () => {
    it.skip('should list run configs for a dataset (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/by-dataset/${datasetId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it.skip('should list run configs after creation', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      await createTestRunConfig({ tenantId, datasetId, suffix: '-1' });
      await createTestRunConfig({ tenantId, datasetId, suffix: '-2' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/by-dataset/${datasetId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
    });
  });

  describe('GET /{runConfigId}', () => {
    it.skip('should get a run config by id', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { configData, configId } = await createTestRunConfig({ tenantId, datasetId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(configId);
      expect(body.data.name).toBe(configData.name);
    });

    it.skip('should return 404 when run config not found', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it.skip('should create a new run config', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const configData = createRunConfigData({ datasetId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe(configData.name);
      expect(body.data.tenantId).toBe(tenantId);
      expect(body.data.datasetId).toBe(datasetId);
    });

    it.skip('should create run config with agents', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-create-agents');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { agentId: agent1 } = await createTestAgent({ tenantId });
      const { agentId: agent2 } = await createTestAgent({ tenantId });

      const configData = {
        ...createRunConfigData({ datasetId }),
        agentIds: [agent1, agent2],
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.datasetId).toBe(datasetId);
    });
  });

  describe('PATCH /{runConfigId}', () => {
    it.skip('should update an existing run config', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-update-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { configId } = await createTestRunConfig({ tenantId, datasetId });
      const updateData = {
        name: 'Updated Run Config Name',
        description: 'Updated description',
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Run Config Name');
      expect(body.data.id).toBe(configId);
    });

    it.skip('should update agent relations', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-update-agents');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { agentId: agent1 } = await createTestAgent({ tenantId });
      const { agentId: agent2 } = await createTestAgent({ tenantId });
      const { configId } = await createTestRunConfig({
        tenantId,
        datasetId,
        agentIds: [agent1],
      });

      // Update to replace agent1 with agent2
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ agentIds: [agent2] }),
        }
      );

      expect(res.status).toBe(200);
    });

    it.skip('should return 404 when run config not found for update', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-update-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/non-existent-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{runConfigId}', () => {
    it.skip('should delete an existing run config', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { datasetId } = await createTestDataset({ tenantId });
      const { configId } = await createTestRunConfig({ tenantId, datasetId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`
      );
      expect(getRes.status).toBe(404);
    });

    it.skip('should return 404 when run config not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it.skip('should complete full run config lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('run-config-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create dataset
      const { datasetId } = await createTestDataset({ tenantId });

      // 2. Create agents
      const { agentId: agent1 } = await createTestAgent({ tenantId });
      const { agentId: agent2 } = await createTestAgent({ tenantId });

      // 3. Create run config with one agent
      const { configId } = await createTestRunConfig({
        tenantId,
        datasetId,
        agentIds: [agent1],
      });

      // 4. Get run config
      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`
      );
      expect(getRes.status).toBe(200);

      // 5. Update to add another agent
      const updateRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: 'Updated Run Config',
            agentIds: [agent1, agent2],
          }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 6. List run configs for dataset
      const listRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/by-dataset/${datasetId}`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 7. Delete run config
      const deleteRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`,
        { method: 'DELETE' }
      );
      expect(deleteRes.status).toBe(204);

      // 8. Verify deletion
      const finalGetRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${configId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});
