import { generateId } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it, vi } from 'vitest';
import manageDbClient from '../../../../../data/db/manageDbClient';
import { makeRequest } from '../../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../../utils/testTenant';

vi.mock('src/domains/evals/services/evaluationJob', () => {
  return {
    queueEvaluationJobConversations: vi.fn().mockResolvedValue({
      conversationCount: 0,
      queued: 0,
      failed: 0,
      evaluationRunId: 'mock-eval-run-id',
    }),
  };
});

describe('Evaluation Job Configs CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createJobConfigData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    jobFilters: {
      agentIds: ['agent-1', 'agent-2'],
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
    },
  });

  const createTestEvaluator = async ({ tenantId }: { tenantId: string }) => {
    const evaluatorData = {
      name: 'Test Evaluator for Job',
      prompt: 'Evaluate quality',
      schema: { type: 'object', properties: { pass: { type: 'boolean' } } },
      model: { model: 'gpt-4o-mini' },
    };
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators`,
      {
        method: 'POST',
        body: JSON.stringify(evaluatorData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { evaluatorId: createBody.data.id };
  };

  const createTestJobConfig = async ({
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
    const configData = { ...createJobConfigData({ suffix }), evaluatorIds: finalEvaluatorIds };
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs`,
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
    it('should list job configs (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('job-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('should list job configs after creation', async () => {
      const tenantId = await createTestTenantWithOrg('job-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      await createTestJobConfig({ tenantId, suffix: '-1' });
      await createTestJobConfig({ tenantId, suffix: '-2' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('GET /{configId}', () => {
    it('should get a job config by id', async () => {
      const tenantId = await createTestTenantWithOrg('job-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configData, configId } = await createTestJobConfig({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(configId);
      expect(body.data.jobFilters).toEqual(configData.jobFilters);
    });

    it('should return 404 when job config not found', async () => {
      const tenantId = await createTestTenantWithOrg('job-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new job config with evaluator', async () => {
      const tenantId = await createTestTenantWithOrg('job-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const configData = { ...createJobConfigData(), evaluatorIds: [evaluatorId] };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.jobFilters).toEqual(configData.jobFilters);
      expect(body.data.tenantId).toBe(tenantId);
    });

    it('should create job config with multiple evaluators', async () => {
      const tenantId = await createTestTenantWithOrg('job-create-with-evaluators');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId: evalId1 } = await createTestEvaluator({ tenantId });
      const { evaluatorId: evalId2 } = await createTestEvaluator({ tenantId });

      const configData = {
        ...createJobConfigData(),
        evaluatorIds: [evalId1, evalId2],
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs`,
        {
          method: 'POST',
          body: JSON.stringify(configData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();

      // Verify evaluators were linked
      const relationsRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${body.data.id}/evaluators`
      );
      expect(relationsRes.status).toBe(200);
      const relationsBody = await relationsRes.json();
      expect(relationsBody.data).toHaveLength(2);
    });
  });

  describe('DELETE /{configId}', () => {
    it('should delete an existing job config', async () => {
      const tenantId = await createTestTenantWithOrg('job-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configId } = await createTestJobConfig({ tenantId });
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when job config not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('job-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET /{configId}/results', () => {
    it('should return empty results when no evaluation runs exist', async () => {
      const tenantId = await createTestTenantWithOrg('job-results-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { configId } = await createTestJobConfig({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/results`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('Evaluator Relations', () => {
    describe('GET /{configId}/evaluators', () => {
      it('should list evaluators for a job config', async () => {
        const tenantId = await createTestTenantWithOrg('job-relations-list');
        await createTestProject(manageDbClient, tenantId, projectId);
        const { evaluatorId } = await createTestEvaluator({ tenantId });
        const { configId } = await createTestJobConfig({
          tenantId,
          evaluatorIds: [evaluatorId],
        });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators`
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toHaveLength(1);
        expect(body.data[0].evaluatorId).toBe(evaluatorId);
      });
    });

    describe('POST /{configId}/evaluators/{evaluatorId}', () => {
      it('should add evaluator to job config', async () => {
        const tenantId = await createTestTenantWithOrg('job-relations-add');
        await createTestProject(manageDbClient, tenantId, projectId);
        // Create two evaluators
        const { evaluatorId: evalId1 } = await createTestEvaluator({ tenantId });
        const { evaluatorId: evalId2 } = await createTestEvaluator({ tenantId });
        // Create config with first evaluator
        const { configId } = await createTestJobConfig({ tenantId, evaluatorIds: [evalId1] });

        // Add second evaluator
        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators/${evalId2}`,
          { method: 'POST' }
        );
        expect(res.status).toBe(201);

        // Verify both evaluators are linked
        const listRes = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators`
        );
        const listBody = await listRes.json();
        expect(listBody.data).toHaveLength(2);
      });
    });

    describe('DELETE /{configId}/evaluators/{evaluatorId}', () => {
      it('should remove evaluator from job config', async () => {
        const tenantId = await createTestTenantWithOrg('job-relations-remove');
        await createTestProject(manageDbClient, tenantId, projectId);
        const { evaluatorId } = await createTestEvaluator({ tenantId });
        const { configId } = await createTestJobConfig({
          tenantId,
          evaluatorIds: [evaluatorId],
        });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators/${evaluatorId}`,
          { method: 'DELETE' }
        );
        expect(res.status).toBe(204);

        // Verify relation was deleted
        const listRes = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators`
        );
        const listBody = await listRes.json();
        expect(listBody.data).toHaveLength(0);
      });

      it('should return 404 when relation not found', async () => {
        const tenantId = await createTestTenantWithOrg('job-relations-404');
        await createTestProject(manageDbClient, tenantId, projectId);
        const { configId } = await createTestJobConfig({ tenantId });

        const res = await makeRequest(
          `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators/non-existent-evaluator`,
          { method: 'DELETE' }
        );
        expect(res.status).toBe(404);
      });
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full job config lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('job-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create evaluators
      const { evaluatorId: evalId1 } = await createTestEvaluator({ tenantId });
      const { evaluatorId: evalId2 } = await createTestEvaluator({ tenantId });

      // 2. Create job config with one evaluator
      const { configId } = await createTestJobConfig({
        tenantId,
        evaluatorIds: [evalId1],
      });

      // 3. Get job config
      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`
      );
      expect(getRes.status).toBe(200);

      // 4. Add another evaluator
      const addRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators/${evalId2}`,
        { method: 'POST' }
      );
      expect(addRes.status).toBe(201);

      // 5. Verify both evaluators are linked
      const listEvalRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators`
      );
      const evalBody = await listEvalRes.json();
      expect(evalBody.data).toHaveLength(2);

      // 6. Check results endpoint (should be empty)
      const resultsRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/results`
      );
      expect(resultsRes.status).toBe(200);

      // 7. Remove one evaluator
      const removeRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}/evaluators/${evalId1}`,
        { method: 'DELETE' }
      );
      expect(removeRes.status).toBe(204);

      // 8. Delete job config
      const deleteRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`,
        { method: 'DELETE' }
      );
      expect(deleteRes.status).toBe(204);

      // 9. Verify deletion
      const finalGetRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluation-job-configs/${configId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});
