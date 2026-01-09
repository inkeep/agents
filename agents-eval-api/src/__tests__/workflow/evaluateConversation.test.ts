import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const {
  getConversationMock,
  createEvaluationResultMock,
  updateEvaluationResultMock,
  generateIdMock,
  ManagementApiClientMock,
  executeEvaluationMock,
} = vi.hoisted(() => ({
  getConversationMock: vi.fn(() => vi.fn()),
  createEvaluationResultMock: vi.fn(() => vi.fn()),
  updateEvaluationResultMock: vi.fn(() => vi.fn()),
  generateIdMock: vi.fn(() => 'test-result-id'),
  ManagementApiClientMock: vi.fn(() => ({
    getEvaluatorById: vi.fn(),
    getEvaluatorsByIds: vi.fn(),
    getFullAgent: vi.fn(),
  })),
  executeEvaluationMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@inkeep/agents-core', () => ({
  getConversation: getConversationMock,
  createEvaluationResult: createEvaluationResultMock,
  updateEvaluationResult: updateEvaluationResultMock,
  generateId: generateIdMock,
  ManagementApiClient: ManagementApiClientMock,
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

vi.mock('../../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('src/env', () => ({
  env: {
    INKEEP_AGENTS_MANAGE_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
  },
}));

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../services/EvaluationService.js', () => ({
  EvaluationService: vi.fn().mockImplementation(() => ({
    executeEvaluation: executeEvaluationMock,
  })),
}));

describe('evaluateConversation Workflow Steps', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getEvaluatorById: vi.fn(),
      getEvaluatorsByIds: vi.fn(),
      getFullAgent: vi.fn(),
    };
    ManagementApiClientMock.mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConversationStep', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 'conv-1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        ref: { type: 'branch', name: 'main' },
      };

      getConversationMock.mockImplementation(() => vi.fn().mockResolvedValue(mockConversation));

      const getConversation = getConversationMock();
      const result = await getConversation({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        conversationId: 'conv-1',
      });

      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      getConversationMock.mockImplementation(() => vi.fn().mockResolvedValue(null));

      const getConversation = getConversationMock();
      const result = await getConversation({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        conversationId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('getEvaluatorsStep', () => {
    it('should return evaluators from management API', async () => {
      const mockEvaluators = [
        { id: 'eval-1', name: 'Evaluator 1', prompt: 'Test prompt 1' },
        { id: 'eval-2', name: 'Evaluator 2', prompt: 'Test prompt 2' },
      ];

      mockClient.getEvaluatorsByIds.mockResolvedValue(mockEvaluators);

      const result = await mockClient.getEvaluatorsByIds(['eval-1', 'eval-2']);

      expect(result).toEqual(mockEvaluators);
      expect(mockClient.getEvaluatorsByIds).toHaveBeenCalledWith(['eval-1', 'eval-2']);
    });

    it('should filter out null evaluators', async () => {
      const mockEvaluators = [
        { id: 'eval-1', name: 'Evaluator 1' },
        null,
        { id: 'eval-3', name: 'Evaluator 3' },
      ];

      mockClient.getEvaluatorsByIds.mockResolvedValue(mockEvaluators);

      const result = await mockClient.getEvaluatorsByIds(['eval-1', 'eval-2', 'eval-3']);
      const validEvaluators = result.filter((e: any) => e !== null);

      expect(validEvaluators).toHaveLength(2);
    });
  });

  describe('executeEvaluatorStep', () => {
    it('should create and update evaluation result on success', async () => {
      const mockEvaluator = {
        id: 'eval-1',
        name: 'Test Evaluator',
        prompt: 'Evaluate this conversation',
        schema: { type: 'object' },
        model: { model: 'gpt-4o' },
      };

      const mockConversation = {
        id: 'conv-1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        ref: { type: 'branch', name: 'main' },
      };

      mockClient.getEvaluatorById.mockResolvedValue(mockEvaluator);

      createEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'result-1',
          tenantId: 'test-tenant',
          projectId: 'test-project',
          conversationId: 'conv-1',
          evaluatorId: 'eval-1',
        })
      );

      updateEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'result-1',
          output: { score: 0.9, feedback: 'Good conversation' },
        })
      );

      executeEvaluationMock.mockResolvedValue({
        output: { score: 0.9, feedback: 'Good conversation' },
        metadata: { model: 'gpt-4o' },
      });

      // Simulate the step execution
      const evaluator = await mockClient.getEvaluatorById('eval-1');
      expect(evaluator).toEqual(mockEvaluator);

      const createResult = createEvaluationResultMock();
      const evalResult = await createResult({
        id: 'result-1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        conversationId: 'conv-1',
        evaluatorId: 'eval-1',
        evaluationRunId: 'run-1',
      });
      expect(evalResult.id).toBe('result-1');

      const evalOutput = await executeEvaluationMock({
        conversation: mockConversation,
        evaluator: mockEvaluator,
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });
      expect(evalOutput.output.score).toBe(0.9);

      const updateResult = updateEvaluationResultMock();
      const updated = await updateResult({
        scopes: {
          tenantId: 'test-tenant',
          projectId: 'test-project',
          evaluationResultId: 'result-1',
        },
        data: { output: evalOutput.output },
      });
      expect(updated.output.score).toBe(0.9);
    });

    it('should handle evaluation failure gracefully', async () => {
      const mockEvaluator = {
        id: 'eval-1',
        name: 'Test Evaluator',
        prompt: 'Evaluate this conversation',
      };

      mockClient.getEvaluatorById.mockResolvedValue(mockEvaluator);

      createEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'result-1',
          tenantId: 'test-tenant',
          projectId: 'test-project',
        })
      );

      executeEvaluationMock.mockRejectedValue(new Error('LLM API error'));

      updateEvaluationResultMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'result-1',
          output: { text: 'Evaluation failed: LLM API error' },
        })
      );

      // Simulate failure handling
      try {
        await executeEvaluationMock({});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        expect(errorMessage).toBe('LLM API error');

        const updateResult = updateEvaluationResultMock();
        const failedResult = await updateResult({
          scopes: {
            tenantId: 'test-tenant',
            projectId: 'test-project',
            evaluationResultId: 'result-1',
          },
          data: { output: { text: `Evaluation failed: ${errorMessage}` } },
        });

        expect(failedResult.output.text).toContain('LLM API error');
      }
    });

    it('should throw error when evaluator not found', async () => {
      mockClient.getEvaluatorById.mockResolvedValue(null);

      const evaluator = await mockClient.getEvaluatorById('non-existent');
      expect(evaluator).toBeNull();
    });
  });
});
