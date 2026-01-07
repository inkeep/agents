import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/dbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('Evaluation Suite Configs CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createSuiteConfigData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    sampleRate: 0.5,
    filters: {
      type: 'and',
      conditions: [{ field: 'agentId', operator: 'equals', value: `test-agent${suffix}` }],
    },
  });

  const createTestEvaluator = async ({ tenantId }: { tenantId: string }) => {
    const evaluatorData = {
      name: 'Test Evaluator for Suite',
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
    suffix = '',
    evaluatorIds,
  }: {
    tenantId: string;
    suffix?: string;
    evaluatorIds?: string[];
  }) => {
    // Ensure at least one evaluator is provided (required by schema)
    let finalEvaluatorIds = evaluatorIds;
    if (!finalEvaluatorIds || finalEvaluatorIds.length === 0) {
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      finalEvaluatorIds = [evaluatorId];
    }
    const configData = { ...createSuiteConfigData({ suffix }), evaluatorIds: finalEvaluatorIds };
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs`,
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
    it('should list suite configs (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('suite-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('should list suite configs after creation', async () => {
      const tenantId = await createTestTenantWithOrg('suite-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      await createTestSuiteConfig({ tenantId, suffix: '-1' });
      await createTestSuiteConfig({ tenantId, suffix: '-2' });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('GET /{configId}', () => {
    it('should get a suite config by id', async () => {
      const tenantId = await createTestTenantWithOrg('suite-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configData, configId } = await createTestSuiteConfig({ tenantId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(configId);
      expect(body.data.sampleRate).toBe(configData.sampleRate);
    });

    it('should return 404 when suite config not found', async () => {
      const tenantId = await createTestTenantWithOrg('suite-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new suite config with evaluator', async () => {
      const tenantId = await createTestTenantWithOrg('suite-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const configData = { ...createSuiteConfigData(), evaluatorIds: [evaluatorId] };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.sampleRate).toBe(configData.sampleRate);
      expect(body.data.tenantId).toBe(tenantId);
    });

    it('should create suite config with multiple evaluators', async () => {
      const tenantId = await createTestTenantWithOrg('suite-create-with-evaluators');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId: evalId1 } = await createTestEvaluator({ tenantId });
      const { evaluatorId: evalId2 } = await createTestEvaluator({ tenantId });

      const configData = {
        ...createSuiteConfigData(),
        evaluatorIds: [evalId1, evalId2],
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.sampleRate).toBe(configData.sampleRate);

      // Verify evaluators were linked
      const relationsRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${body.data.id}/evaluators`
      );
      expect(relationsRes.status).toBe(200);
      const relationsBody = await relationsRes.json();
      expect(relationsBody.data).toHaveLength(2);
    });
  });

  describe('PATCH /{configId}', () => {
    it('should update an existing suite config', async () => {
      const tenantId = await createTestTenantWithOrg('suite-update-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configId } = await createTestSuiteConfig({ tenantId });
      const updateData = {
        sampleRate: 0.75,
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.sampleRate).toBe(0.75);
      expect(body.data.id).toBe(configId);
    });

    it('should return 404 when suite config not found for update', async () => {
      const tenantId = await createTestTenantWithOrg('suite-update-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/non-existent-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{configId}', () => {
    it('should delete an existing suite config', async () => {
      const tenantId = await createTestTenantWithOrg('suite-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configId } = await createTestSuiteConfig({ tenantId });
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when suite config not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('suite-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Evaluator Relations', () => {
    describe('GET /{configId}/evaluators', () => {
      it('should list evaluators for a suite config', async () => {
        const tenantId = await createTestTenantWithOrg('suite-relations-list');
        await createTestProject(manageDbClient, tenantId, projectId);
        const { evaluatorId } = await createTestEvaluator({ tenantId });
        const { configId } = await createTestSuiteConfig({
          tenantId,
          evaluatorIds: [evaluatorId],
        });

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators`
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].evaluatorId).toBe(evaluatorId);
      });
    });

    describe('POST /{configId}/evaluators/{evaluatorId}', () => {
      it('should add evaluator to suite config', async () => {
        const tenantId = await createTestTenantWithOrg('suite-relations-add');
        await createTestProject(manageDbClient, tenantId, projectId);
        // Create two evaluators
        const { evaluatorId: evalId1 } = await createTestEvaluator({ tenantId });
        const { evaluatorId: evalId2 } = await createTestEvaluator({ tenantId });
        // Create config with first evaluator
        const { configId } = await createTestSuiteConfig({ tenantId, evaluatorIds: [evalId1] });

        // Add second evaluator
        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators/${evalId2}`,
          { method: 'POST' }
        );
        expect(res.status).toBe(201);

        // Verify both evaluators are linked
        const listRes = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators`
        );
        const listBody = await listRes.json();
        expect(listBody.data).toHaveLength(2);
      });
    });

    describe('DELETE /{configId}/evaluators/{evaluatorId}', () => {
      it('should remove evaluator from suite config', async () => {
        const tenantId = await createTestTenantWithOrg('suite-relations-remove');
        await createTestProject(manageDbClient, tenantId, projectId);
        const { evaluatorId } = await createTestEvaluator({ tenantId });
        const { configId } = await createTestSuiteConfig({
          tenantId,
          evaluatorIds: [evaluatorId],
        });

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators/${evaluatorId}`,
          { method: 'DELETE' }
        );
        expect(res.status).toBe(204);

        // Verify relation was deleted
        const listRes = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators`
        );
        const listBody = await listRes.json();
        expect(listBody.data).toHaveLength(0);
      });

      it('should return 404 when relation not found', async () => {
        const tenantId = await createTestTenantWithOrg('suite-relations-404');
        await createTestProject(manageDbClient, tenantId, projectId);
        const { configId } = await createTestSuiteConfig({ tenantId });

        const res = await makeRequest(
          `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators/non-existent-evaluator`,
          { method: 'DELETE' }
        );
        expect(res.status).toBe(404);
      });
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full suite config lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('suite-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create evaluators
      const { evaluatorId: evalId1 } = await createTestEvaluator({ tenantId });
      const { evaluatorId: evalId2 } = await createTestEvaluator({ tenantId });

      // 2. Create suite config with one evaluator
      const { configId } = await createTestSuiteConfig({
        tenantId,
        evaluatorIds: [evalId1],
      });

      // 3. Get suite config
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`
      );
      expect(getRes.status).toBe(200);

      // 4. Add another evaluator
      const addRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators/${evalId2}`,
        { method: 'POST' }
      );
      expect(addRes.status).toBe(201);

      // 5. Verify both evaluators are linked
      const listEvalRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators`
      );
      const evalBody = await listEvalRes.json();
      expect(evalBody.data).toHaveLength(2);

      // 6. Update suite config
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ sampleRate: 0.9 }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 7. Remove one evaluator
      const removeRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}/evaluators/${evalId1}`,
        { method: 'DELETE' }
      );
      expect(removeRes.status).toBe(204);

      // 8. Delete suite config
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`,
        { method: 'DELETE' }
      );
      expect(deleteRes.status).toBe(204);

      // 9. Verify deletion
      const finalGetRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-suite-configs/${configId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});

