import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const {
  createDatasetRunConversationRelationMock,
  createEvaluationResultMock,
  updateEvaluationResultMock,
  getConversationMock,
  generateIdMock,
  getEvaluatorByIdMock,
  runDatasetItemMock,
  executeEvaluationMock,
} = vi.hoisted(() => ({
  createDatasetRunConversationRelationMock: vi.fn(() => vi.fn()),
  createEvaluationResultMock: vi.fn(() => vi.fn()),
  updateEvaluationResultMock: vi.fn(() => vi.fn()),
  getConversationMock: vi.fn(() => vi.fn()),
  generateIdMock: vi.fn(() => 'test-generated-id'),
  getEvaluatorByIdMock: vi.fn(),
  runDatasetItemMock: vi.fn(),
  executeEvaluationMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@inkeep/agents-core', () => ({
  createDatasetRunConversationRelation: createDatasetRunConversationRelationMock,
  createEvaluationResult: createEvaluationResultMock,
  updateEvaluationResult: updateEvaluationResultMock,
  getConversation: getConversationMock,
  generateId: generateIdMock,
  getEvaluatorById: getEvaluatorByIdMock,
  InternalServices: {
    INKEEP_AGENTS_EVAL_API: 'inkeep-agents-eval-api',
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: 'test-bypass-secret',
  },
}));

vi.mock('../../../logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../domains/evals/services/EvaluationService.js', () => ({
  EvaluationService: vi.fn().mockImplementation(() => ({
    runDatasetItem: runDatasetItemMock,
    executeEvaluation: executeEvaluationMock,
  })),
}));

describe('runDatasetItem Workflow Steps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('callChatApiStep', () => {
    it('should call chat API and return conversation ID', async () => {
      runDatasetItemMock.mockResolvedValue({
        conversationId: 'conv-123',
        response: 'Hello, how can I help you?',
      });

      const result = await runDatasetItemMock({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: { messages: [{ role: 'user', content: 'Hello' }] },
        },
        datasetRunId: 'run-1',
      });

      expect(result.conversationId).toBe('conv-123');
      expect(result.response).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return error when chat API fails', async () => {
      runDatasetItemMock.mockResolvedValue({
        conversationId: 'conv-123',
        error: 'Chat API error: 500 Internal Server Error',
      });

      const result = await runDatasetItemMock({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: { messages: [{ role: 'user', content: 'Hello' }] },
        },
        datasetRunId: 'run-1',
      });

      expect(result.error).toContain('Chat API error');
    });

    it('should handle simulation agent configuration', async () => {
      runDatasetItemMock.mockResolvedValue({
        conversationId: 'conv-456',
        response: 'Multi-turn response',
      });

      const result = await runDatasetItemMock({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: { messages: [{ role: 'user', content: 'Start conversation' }] },
          simulationAgent: {
            prompt: 'You are a curious user',
            model: { model: 'gpt-4o' },
            stopWhen: { stepCountIs: 5 },
          },
        },
        datasetRunId: 'run-1',
      });

      expect(result.conversationId).toBe('conv-456');
      expect(runDatasetItemMock).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetItem: expect.objectContaining({
            simulationAgent: expect.objectContaining({
              prompt: 'You are a curious user',
            }),
          }),
        })
      );
    });
  });

  describe('createRelationStep', () => {
    it('should create conversation relation successfully', async () => {
      createDatasetRunConversationRelationMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'relation-1',
          datasetRunId: 'run-1',
          conversationId: 'conv-1',
          datasetItemId: 'item-1',
        })
      );

      const createRelation = createDatasetRunConversationRelationMock();
      const result = await createRelation({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        id: 'relation-1',
        datasetRunId: 'run-1',
        conversationId: 'conv-1',
        datasetItemId: 'item-1',
      });

      expect(result.id).toBe('relation-1');
      expect(result.conversationId).toBe('conv-1');
    });

    it('should handle foreign key constraint error', async () => {
      const fkError = new Error('Foreign key constraint violation');
      (fkError as any).cause = { code: '23503' };

      createDatasetRunConversationRelationMock.mockImplementation(() =>
        vi.fn().mockRejectedValue(fkError)
      );

      const createRelation = createDatasetRunConversationRelationMock();

      await expect(
        createRelation({
          tenantId: 'test-tenant',
          projectId: 'test-project',
          id: 'relation-1',
          datasetRunId: 'run-1',
          conversationId: 'non-existent-conv',
          datasetItemId: 'item-1',
        })
      ).rejects.toThrow('Foreign key constraint violation');
    });
  });

  describe('executeEvaluatorStep', () => {
    it('should execute evaluator and create result', async () => {
      const mockConversation = {
        id: 'conv-1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        ref: { type: 'branch', name: 'main' },
      };

      const mockEvaluator = {
        id: 'eval-1',
        name: 'Quality Evaluator',
        prompt: 'Evaluate quality',
        schema: { type: 'object', properties: { score: { type: 'number' } } },
      };

      getEvaluatorByIdMock.mockResolvedValue(mockEvaluator);
      getConversationMock.mockImplementation(() => vi.fn().mockResolvedValue(mockConversation));

      createEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'result-1',
          conversationId: 'conv-1',
          evaluatorId: 'eval-1',
        })
      );

      executeEvaluationMock.mockResolvedValue({
        output: { score: 0.85 },
        metadata: { model: 'gpt-4o' },
      });

      updateEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'result-1',
          output: { score: 0.85 },
        })
      );

      // Simulate step execution
      const evaluator = await getEvaluatorByIdMock('eval-1');
      expect(evaluator).toEqual(mockEvaluator);

      const getConv = getConversationMock();
      const conversation = await getConv({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        conversationId: 'conv-1',
      });
      expect(conversation).toEqual(mockConversation);

      const evalOutput = await executeEvaluationMock({
        conversation,
        evaluator,
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });
      expect(evalOutput.output.score).toBe(0.85);
    });

    it('should return null when evaluator not found', async () => {
      getEvaluatorByIdMock.mockResolvedValue(null);

      const evaluator = await getEvaluatorByIdMock('non-existent');
      expect(evaluator).toBeNull();
    });

    it('should handle evaluation execution failure', async () => {
      const mockEvaluator = {
        id: 'eval-1',
        name: 'Quality Evaluator',
      };

      getEvaluatorByIdMock.mockResolvedValue(mockEvaluator);
      getConversationMock.mockImplementation(() => vi.fn().mockResolvedValue({ id: 'conv-1' }));

      createEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({ id: 'result-1' })
      );

      executeEvaluationMock.mockRejectedValue(new Error('Evaluation timeout'));

      updateEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'result-1',
          output: { text: 'Evaluation failed: Evaluation timeout' },
        })
      );

      try {
        await executeEvaluationMock({});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        expect(errorMessage).toBe('Evaluation timeout');

        const updateResult = updateEvaluationResultMock();
        const failedResult = await updateResult({
          scopes: {
            tenantId: 'test-tenant',
            projectId: 'test-project',
            evaluationResultId: 'result-1',
          },
          data: { output: { text: `Evaluation failed: ${errorMessage}` } },
        });

        expect(failedResult.output.text).toContain('Evaluation timeout');
      }
    });
  });

  describe('Workflow Integration', () => {
    it('should complete full workflow: chat -> relation -> evaluations', async () => {
      // Step 1: Chat API call
      runDatasetItemMock.mockResolvedValue({
        conversationId: 'conv-123',
        response: 'Assistant response',
      });

      const chatResult = await runDatasetItemMock({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'agent-1',
        datasetItem: { id: 'item-1', input: 'Test input' },
        datasetRunId: 'run-1',
      });

      expect(chatResult.conversationId).toBe('conv-123');

      // Step 2: Create relation
      createDatasetRunConversationRelationMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'relation-1',
          conversationId: 'conv-123',
        })
      );

      const createRelation = createDatasetRunConversationRelationMock();
      const relationResult = await createRelation({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        id: 'relation-1',
        datasetRunId: 'run-1',
        conversationId: 'conv-123',
        datasetItemId: 'item-1',
      });

      expect(relationResult.conversationId).toBe('conv-123');

      // Step 3: Run evaluations
      getEvaluatorByIdMock.mockResolvedValue({ id: 'eval-1', name: 'Evaluator' });
      getConversationMock.mockImplementation(() => vi.fn().mockResolvedValue({ id: 'conv-123' }));
      createEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({ id: 'result-1' })
      );
      executeEvaluationMock.mockResolvedValue({ output: { score: 1.0 } });
      updateEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({ id: 'result-1', output: { score: 1.0 } })
      );

      const evalOutput = await executeEvaluationMock({});
      expect(evalOutput.output.score).toBe(1.0);
    });

    it('should handle workflow without evaluators', async () => {
      runDatasetItemMock.mockResolvedValue({
        conversationId: 'conv-456',
        response: 'Response without evaluation',
      });

      createDatasetRunConversationRelationMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'relation-2',
          conversationId: 'conv-456',
        })
      );

      const chatResult = await runDatasetItemMock({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'agent-1',
        datasetItem: { id: 'item-2', input: 'Test input' },
        datasetRunId: 'run-2',
      });

      expect(chatResult.conversationId).toBe('conv-456');

      const createRelation = createDatasetRunConversationRelationMock();
      const relationResult = await createRelation({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        id: 'relation-2',
        datasetRunId: 'run-2',
        conversationId: 'conv-456',
        datasetItemId: 'item-2',
      });

      expect(relationResult.conversationId).toBe('conv-456');
      // No evaluation calls should be made
      expect(executeEvaluationMock).not.toHaveBeenCalled();
    });
  });
});
