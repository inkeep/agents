import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/dbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('Evaluation Run Configs CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createRunConfigData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    name: `Test Run Config${suffix}`,
    description: `Test run configuration${suffix}`,
    isActive: true,
  });

  const createTestEvaluator = async ({ tenantId }: { tenantId: string }) => {
    const evaluatorData = {
      name: 'Test Evaluator',
      prompt: 'Evaluate quality',
      schema: { type: 'object', properties: { pass: { type: 'boolean' } } },
      model: { model: 'gpt-4o-mini' },
    };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/evals/evaluators`,
      {
        method: 'POST',
        body: JSON.stringify(evaluatorData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { evaluatorId: createBody.data.id };
  };

  const createTestSuiteConfig = async ({
    tenantId,
    evaluatorId,
  }: {
    tenantId: string;
    evaluatorId?: string;
  }) => {
    // Ensure an evaluator exists
    let evalId = evaluatorId;
    if (!evalId) {
      const { evaluatorId: newEvalId } = await createTestEvaluator({ tenantId });
      evalId = newEvalId;
    }
    const suiteData = {
      name: 'Test Suite',
      evaluatorIds: [evalId],
    };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs`,
      {
        method: 'POST',
        body: JSON.stringify(suiteData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { suiteConfigId: createBody.data.id };
  };

  const createTestRunConfig = async ({
    tenantId,
    suffix = '',
    suiteConfigIds,
  }: {
    tenantId: string;
    suffix?: string;
    suiteConfigIds?: string[];
  }) => {
    // Ensure at least one suite config is provided (required by schema)
    let finalSuiteConfigIds = suiteConfigIds;
    if (!finalSuiteConfigIds || finalSuiteConfigIds.length === 0) {
      const { suiteConfigId } = await createTestSuiteConfig({ tenantId });
      finalSuiteConfigIds = [suiteConfigId];
    }
    const configData = { ...createRunConfigData({ suffix }), suiteConfigIds: finalSuiteConfigIds };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs`,
      {
        method: 'POST',
        body: JSON.stringify(configData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { configData, configId: createBody.data.id };
  };

  describe('GET /', () => {
    it('should list run configs (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('run-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('should list run configs after creation', async () => {
      const tenantId = await createTestTenantWithOrg('run-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      await createTestRunConfig({ tenantId, suffix: '-1' });
      await createTestRunConfig({ tenantId, suffix: '-2' });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it('should include suiteConfigIds in list response', async () => {
      const tenantId = await createTestTenantWithOrg('run-list-with-suites');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { suiteConfigId } = await createTestSuiteConfig({ tenantId, evaluatorId });
      await createTestRunConfig({ tenantId, suiteConfigIds: [suiteConfigId] });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].suiteConfigIds).toContain(suiteConfigId);
    });
  });

  describe('GET /{configId}', () => {
    it('should get a run config by id', async () => {
      const tenantId = await createTestTenantWithOrg('run-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { suiteConfigId } = await createTestSuiteConfig({ tenantId, evaluatorId });
      const { configData, configId } = await createTestRunConfig({
        tenantId,
        suiteConfigIds: [suiteConfigId],
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(configId);
      expect(body.data.name).toBe(configData.name);
      expect(body.data.suiteConfigIds).toContain(suiteConfigId);
    });

    it('should return 404 when run config not found', async () => {
      const tenantId = await createTestTenantWithOrg('run-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new run config with suite config', async () => {
      const tenantId = await createTestTenantWithOrg('run-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { suiteConfigId } = await createTestSuiteConfig({ tenantId });
      const configData = { ...createRunConfigData(), suiteConfigIds: [suiteConfigId] };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe(configData.name);
      expect(body.data.tenantId).toBe(tenantId);
      expect(body.data.isActive).toBe(true);
    });

    it('should create run config with multiple suite configs', async () => {
      const tenantId = await createTestTenantWithOrg('run-create-with-suites');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { suiteConfigId: suite1 } = await createTestSuiteConfig({ tenantId, evaluatorId });
      const { suiteConfigId: suite2 } = await createTestSuiteConfig({ tenantId, evaluatorId });

      const configData = {
        ...createRunConfigData(),
        suiteConfigIds: [suite1, suite2],
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.suiteConfigIds).toHaveLength(2);
      expect(body.data.suiteConfigIds).toContain(suite1);
      expect(body.data.suiteConfigIds).toContain(suite2);
    });
  });

  describe('PATCH /{configId}', () => {
    it('should update an existing run config', async () => {
      const tenantId = await createTestTenantWithOrg('run-update-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configId } = await createTestRunConfig({ tenantId });
      const updateData = {
        name: 'Updated Run Config Name',
        isActive: false,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Run Config Name');
      expect(body.data.isActive).toBe(false);
    });

    it('should update suite config relations', async () => {
      const tenantId = await createTestTenantWithOrg('run-update-suites');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { suiteConfigId: suite1 } = await createTestSuiteConfig({ tenantId, evaluatorId });
      const { suiteConfigId: suite2 } = await createTestSuiteConfig({ tenantId, evaluatorId });
      const { configId } = await createTestRunConfig({
        tenantId,
        suiteConfigIds: [suite1],
      });

      // Update to replace suite1 with suite2
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ suiteConfigIds: [suite2] }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.suiteConfigIds).toHaveLength(1);
      expect(body.data.suiteConfigIds).toContain(suite2);
      expect(body.data.suiteConfigIds).not.toContain(suite1);
    });

    it('should return 404 when run config not found for update', async () => {
      const tenantId = await createTestTenantWithOrg('run-update-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/non-existent-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{configId}', () => {
    it('should delete an existing run config', async () => {
      const tenantId = await createTestTenantWithOrg('run-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configId } = await createTestRunConfig({ tenantId });
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when run config not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('run-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET /{configId}/results', () => {
    it('should return empty results when no evaluation runs exist', async () => {
      const tenantId = await createTestTenantWithOrg('run-results-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configId } = await createTestRunConfig({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}/results`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full run config lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('run-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create evaluator and suite config
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { suiteConfigId: suite1 } = await createTestSuiteConfig({ tenantId, evaluatorId });
      const { suiteConfigId: suite2 } = await createTestSuiteConfig({ tenantId, evaluatorId });

      // 2. Create run config with one suite
      const { configId } = await createTestRunConfig({
        tenantId,
        suiteConfigIds: [suite1],
      });

      // 3. Get run config
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`
      );
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.suiteConfigIds).toContain(suite1);

      // 4. Update to add another suite
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: 'Updated Run Config',
            suiteConfigIds: [suite1, suite2],
          }),
        }
      );
      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.data.suiteConfigIds).toHaveLength(2);

      // 5. Check results endpoint
      const resultsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}/results`
      );
      expect(resultsRes.status).toBe(200);

      // 6. List all run configs
      const listRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 7. Delete run config
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`,
        { method: 'DELETE' }
      );
      expect(deleteRes.status).toBe(204);

      // 8. Verify deletion
      const finalGetRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-run-configs/${configId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});

