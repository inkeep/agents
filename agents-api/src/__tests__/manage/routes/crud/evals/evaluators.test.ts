import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../../data/db/manageDbClient';
import { makeRequest } from '../../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../../utils/testTenant';

describe('Evaluators CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  const createEvaluatorData = ({ suffix = '' }: { suffix?: string } = {}): any => ({
    name: `Test Evaluator${suffix}`,
    description: `Test evaluator description${suffix}`,
    prompt: 'Evaluate the response quality on a scale of 1-10',
    schema: {
      type: 'object',
      properties: {
        score: { type: 'number', minimum: 1, maximum: 10 },
        reasoning: { type: 'string' },
      },
      required: ['score', 'reasoning'],
    },
    model: {
      model: 'gpt-4o-mini',
    },
  });

  const createTestEvaluator = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    const evaluatorData = createEvaluatorData({ suffix });
    const createRes = await makeRequest(
      `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators`,
      {
        method: 'POST',
        body: JSON.stringify(evaluatorData),
      }
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { evaluatorData, evaluatorId: createBody.data.id };
  };

  describe('GET /', () => {
    it('should list evaluators with pagination (empty initially)', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-list-empty');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('should list evaluators after creation', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-list-created');
      await createTestProject(manageDbClient, tenantId, projectId);
      await createTestEvaluator({ tenantId, suffix: '-1' });
      await createTestEvaluator({ tenantId, suffix: '-2' });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('GET /{evaluatorId}', () => {
    it('should get an evaluator by id', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorData, evaluatorId } = await createTestEvaluator({ tenantId });

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(evaluatorId);
      expect(body.data.name).toBe(evaluatorData.name);
    });

    it('should return 404 when evaluator not found', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /batch', () => {
    it('should get multiple evaluators by IDs', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-batch-get');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId: id1 } = await createTestEvaluator({ tenantId, suffix: '-1' });
      const { evaluatorId: id2 } = await createTestEvaluator({ tenantId, suffix: '-2' });
      await createTestEvaluator({ tenantId, suffix: '-3' }); // Not in batch request

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/batch`,
        {
          method: 'POST',
          body: JSON.stringify({ evaluatorIds: [id1, id2] }),
        }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data.map((e: any) => e.id).sort()).toEqual([id1, id2].sort());
    });

    it('should return empty array for non-existent IDs', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-batch-empty');
      await createTestProject(manageDbClient, tenantId, projectId);

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/batch`,
        {
          method: 'POST',
          body: JSON.stringify({ evaluatorIds: ['non-existent-1', 'non-existent-2'] }),
        }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe('POST /', () => {
    it('should create a new evaluator', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const evaluatorData = createEvaluatorData();

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators`,
        {
          method: 'POST',
          body: JSON.stringify(evaluatorData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe(evaluatorData.name);
      expect(body.data.tenantId).toBe(tenantId);
      expect(body.data.prompt).toBe(evaluatorData.prompt);
    });

    it('should create evaluator with minimal required data', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-create-minimal');
      await createTestProject(manageDbClient, tenantId, projectId);
      const minimalData = {
        name: 'Minimal Evaluator',
        prompt: 'Evaluate quality',
        schema: { type: 'object', properties: { pass: { type: 'boolean' } } },
        model: { model: 'gpt-4o-mini' },
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators`,
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

  describe('PATCH /{evaluatorId}', () => {
    it('should update an existing evaluator', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-update-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const updateData = {
        name: 'Updated Evaluator Name',
        prompt: 'Updated evaluation prompt',
      };

      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe('Updated Evaluator Name');
      expect(body.data.prompt).toBe('Updated evaluation prompt');
      expect(body.data.id).toBe(evaluatorId);
    });

    it('should return 404 when evaluator not found for update', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-update-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/non-existent-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{evaluatorId}', () => {
    it('should delete an existing evaluator', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when evaluator not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full evaluator lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('evaluators-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create evaluator
      const { evaluatorId } = await createTestEvaluator({ tenantId });

      // 2. Get evaluator
      const getRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`
      );
      expect(getRes.status).toBe(200);

      // 3. Update evaluator
      const updateRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Evaluator' }),
        }
      );
      expect(updateRes.status).toBe(200);

      // 4. List evaluators (should include our evaluator)
      const listRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators`
      );
      expect(listRes.status).toBe(200);
      const listBody = await listRes.json();
      expect(listBody.data).toHaveLength(1);

      // 5. Delete evaluator
      const deleteRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // 6. Verify deletion
      const finalGetRes = await makeRequest(
        `/manage/tenants/${tenantId}/projects/${projectId}/evals/evaluators/${evaluatorId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});
