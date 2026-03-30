import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../../data/db/manageDbClient';
import { makeRequest } from '../../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../../utils/testTenant';

describe('Agent-Dataset Relations CRUD Routes', () => {
  const projectId = 'default';

  const createTestDataset = async ({ tenantId }: { tenantId: string }) => {
    const res = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets`,
      { method: 'POST', body: JSON.stringify({ name: `Dataset ${generateId(8)}` }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    return body.data.id as string;
  };

  const createTestAgent = async ({ tenantId }: { tenantId: string }) => {
    const id = generateId();
    const res = await makeRequest(`/manage/tenants/${tenantId}/projects/${projectId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ id, name: id, contextConfigId: null }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    return body.data.id as string;
  };

  describe('GET /{datasetId}/agents', () => {
    it('should return empty list when no agents are scoped', async () => {
      const tenantId = await createTestTenantWithOrg('adr-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetId = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should list agents after adding relations', async () => {
      const tenantId = await createTestTenantWithOrg('adr-list-after-add');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetId = await createTestDataset({ tenantId });
      const agentId1 = await createTestAgent({ tenantId });
      const agentId2 = await createTestAgent({ tenantId });

      await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId1}`,
        { method: 'POST' }
      );
      await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId2}`,
        { method: 'POST' }
      );

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      const agentIds = body.data.map((r: any) => r.agentId);
      expect(agentIds).toContain(agentId1);
      expect(agentIds).toContain(agentId2);
    });
  });

  describe('POST /{datasetId}/agents/{agentId}', () => {
    it('should create an agent-dataset relation', async () => {
      const tenantId = await createTestTenantWithOrg('adr-create');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetId = await createTestDataset({ tenantId });
      const agentId = await createTestAgent({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId}`,
        { method: 'POST' }
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.datasetId).toBe(datasetId);
      expect(body.data.agentId).toBe(agentId);
      expect(body.data.tenantId).toBe(tenantId);
      expect(body.data.projectId).toBe(projectId);
    });

    it('should return 500 when creating duplicate relation', async () => {
      const tenantId = await createTestTenantWithOrg('adr-create-dup');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetId = await createTestDataset({ tenantId });
      const agentId = await createTestAgent({ tenantId });

      const res1 = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId}`,
        { method: 'POST' }
      );
      expect(res1.status).toBe(201);

      const res2 = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId}`,
        { method: 'POST' }
      );
      expect(res2.status).toBe(500);
    });
  });

  describe('DELETE /{datasetId}/agents/{agentId}', () => {
    it('should delete an existing relation', async () => {
      const tenantId = await createTestTenantWithOrg('adr-delete');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetId = await createTestDataset({ tenantId });
      const agentId = await createTestAgent({ tenantId });

      await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId}`,
        { method: 'POST' }
      );

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId}`,
        { method: 'DELETE' }
      );
      expect(res.status).toBe(204);

      const listRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents`
      );
      const listBody = await listRes.json();
      expect(listBody.data).toEqual([]);
    });

    it('should return 404 when relation does not exist', async () => {
      const tenantId = await createTestTenantWithOrg('adr-delete-404');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetId = await createTestDataset({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/non-existent`,
        { method: 'DELETE' }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full relation lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('adr-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);
      const datasetId = await createTestDataset({ tenantId });
      const agentId = await createTestAgent({ tenantId });

      const createRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId}`,
        { method: 'POST' }
      );
      expect(createRes.status).toBe(201);

      const listRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0].agentId).toBe(agentId);

      const deleteRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents/${agentId}`,
        { method: 'DELETE' }
      );
      expect(deleteRes.status).toBe(204);

      const finalList = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/datasets/${datasetId}/agents`
      );
      const finalBody = await finalList.json();
      expect(finalBody.data).toEqual([]);
    });
  });
});
