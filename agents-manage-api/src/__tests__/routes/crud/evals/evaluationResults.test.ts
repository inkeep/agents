import { generateId, createEvaluationResult, createEvaluationRun, createConversation } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { describe, expect, it } from 'vitest';
import manageDbClient from '../../../../data/db/dbClient';
import runDbClient from '../../../../data/db/runDbClient';
import { makeRequest } from '../../../utils/testRequest';
import { createTestTenantWithOrg } from '../../../utils/testTenant';

describe('Evaluation Results CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

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

  const createTestConversation = async ({ tenantId }: { tenantId: string }) => {
    const conversationId = generateId(16);
    await createConversation(runDbClient)({
      id: conversationId,
      tenantId,
      projectId,
      agentId: 'test-agent',
      activeSubAgentId: 'test-agent',
      ref: `ref-${conversationId}`,
    });
    return { conversationId };
  };

  const createTestEvaluationRun = async ({ tenantId }: { tenantId: string }) => {
    const runId = generateId(16);
    await createEvaluationRun(runDbClient)({
      id: runId,
      tenantId,
      projectId,
      evaluationJobConfigId: undefined,
      evaluationRunConfigId: undefined,
    });
    return { evaluationRunId: runId };
  };

  const createTestEvaluationResult = async ({
    tenantId,
    evaluatorId,
    conversationId,
    evaluationRunId,
  }: {
    tenantId: string;
    evaluatorId: string;
    conversationId: string;
    evaluationRunId: string;
  }) => {
    const resultId = generateId(16);
    await createEvaluationResult(runDbClient)({
      id: resultId,
      tenantId,
      projectId,
      evaluatorId,
      conversationId,
      evaluationRunId,
      output: { score: 8, reasoning: 'Good quality response' },
    });
    return { resultId };
  };

  const createResultData = ({
    evaluatorId,
    conversationId,
    evaluationRunId,
  }: {
    evaluatorId: string;
    conversationId: string;
    evaluationRunId: string;
  }): any => ({
    id: generateId(16),
    evaluatorId,
    conversationId,
    evaluationRunId,
    output: {
      score: 9,
      reasoning: 'Excellent response quality',
    },
  });

  describe('GET /{resultId}', () => {
    it('should get an evaluation result by id', async () => {
      const tenantId = await createTestTenantWithOrg('results-get-by-id');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { conversationId } = await createTestConversation({ tenantId });
      const { evaluationRunId } = await createTestEvaluationRun({ tenantId });
      const { resultId } = await createTestEvaluationResult({
        tenantId,
        evaluatorId,
        conversationId,
        evaluationRunId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(resultId);
      expect(body.data.evaluatorId).toBe(evaluatorId);
      expect(body.data.conversationId).toBe(conversationId);
      expect(body.data.output).toBeDefined();
    });

    it('should return 404 when result not found', async () => {
      const tenantId = await createTestTenantWithOrg('results-get-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/non-existent-id`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new evaluation result', async () => {
      const tenantId = await createTestTenantWithOrg('results-create-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { conversationId } = await createTestConversation({ tenantId });
      const { evaluationRunId } = await createTestEvaluationRun({ tenantId });
      const resultData = createResultData({ evaluatorId, conversationId, evaluationRunId });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results`,
        {
          method: 'POST',
          body: JSON.stringify(resultData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.evaluatorId).toBe(evaluatorId);
      expect(body.data.conversationId).toBe(conversationId);
      expect(body.data.output).toEqual(resultData.output);
      expect(body.data.tenantId).toBe(tenantId);
    });

    it('should create result with complex result object', async () => {
      const tenantId = await createTestTenantWithOrg('results-create-complex');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { conversationId } = await createTestConversation({ tenantId });
      const { evaluationRunId } = await createTestEvaluationRun({ tenantId });
      const resultData = {
        evaluatorId,
        conversationId,
        evaluationRunId,
        output: {
          score: 7,
          reasoning: 'Good but could be improved',
          categories: {
            accuracy: 8,
            helpfulness: 7,
            clarity: 6,
          },
          suggestions: ['Be more concise', 'Add examples'],
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results`,
        {
          method: 'POST',
          body: JSON.stringify(resultData),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.output.categories).toEqual(resultData.output.categories);
      expect(body.data.output.suggestions).toEqual(resultData.output.suggestions);
    });
  });

  describe('PATCH /{resultId}', () => {
    it('should update an existing evaluation result', async () => {
      const tenantId = await createTestTenantWithOrg('results-update-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { conversationId } = await createTestConversation({ tenantId });
      const { evaluationRunId } = await createTestEvaluationRun({ tenantId });
      const { resultId } = await createTestEvaluationResult({
        tenantId,
        evaluatorId,
        conversationId,
        evaluationRunId,
      });

      const updateData = {
        output: {
          score: 10,
          reasoning: 'Re-evaluated: Perfect response',
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.output.score).toBe(10);
      expect(body.data.output.reasoning).toBe('Re-evaluated: Perfect response');
    });

    it('should return 404 when result not found for update', async () => {
      const tenantId = await createTestTenantWithOrg('results-update-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/non-existent-id`,
        {
          method: 'PATCH',
          body: JSON.stringify({ output: { score: 5 } }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /{resultId}', () => {
    it('should delete an existing evaluation result', async () => {
      const tenantId = await createTestTenantWithOrg('results-delete-success');
      await createTestProject(manageDbClient, tenantId, projectId);
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { conversationId } = await createTestConversation({ tenantId });
      const { evaluationRunId } = await createTestEvaluationRun({ tenantId });
      const { resultId } = await createTestEvaluationResult({
        tenantId,
        evaluatorId,
        conversationId,
        evaluationRunId,
      });

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(204);

      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`
      );
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when result not found for deletion', async () => {
      const tenantId = await createTestTenantWithOrg('results-delete-not-found');
      await createTestProject(manageDbClient, tenantId, projectId);
      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/non-existent-id`,
        {
          method: 'DELETE',
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full evaluation result lifecycle', async () => {
      const tenantId = await createTestTenantWithOrg('results-e2e');
      await createTestProject(manageDbClient, tenantId, projectId);

      // 1. Create prerequisites
      const { evaluatorId } = await createTestEvaluator({ tenantId });
      const { conversationId } = await createTestConversation({ tenantId });
      const { evaluationRunId } = await createTestEvaluationRun({ tenantId });

      // 2. Create result
      const resultData = createResultData({ evaluatorId, conversationId, evaluationRunId });
      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results`,
        {
          method: 'POST',
          body: JSON.stringify(resultData),
        }
      );
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const resultId = createBody.data.id;

      // 3. Get result
      const getRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`
      );
      expect(getRes.status).toBe(200);

      // 4. Update result
      const updateRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            output: { score: 10, reasoning: 'Updated evaluation' },
          }),
        }
      );
      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.data.output.score).toBe(10);

      // 5. Delete result
      const deleteRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`,
        { method: 'DELETE' }
      );
      expect(deleteRes.status).toBe(204);

      // 6. Verify deletion
      const finalGetRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/evals/evaluation-results/${resultId}`
      );
      expect(finalGetRes.status).toBe(404);
    });
  });
});

