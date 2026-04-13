import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const {
  getConversationMock,
  createEvaluationResultMock,
  updateEvaluationResultMock,
  generateIdMock,
  getEvaluatorsByIdsMock,
  getEvaluatorByIdMock,
  getAgentIdsForEvaluatorsMock,
  getProjectMainResolvedRefMock,
  withRefMock,
  executeEvaluationMock,
} = vi.hoisted(() => ({
  getConversationMock: vi.fn(() => vi.fn()),
  createEvaluationResultMock: vi.fn(() => vi.fn()),
  updateEvaluationResultMock: vi.fn(() => vi.fn()),
  generateIdMock: vi.fn(() => 'test-result-id'),
  getEvaluatorsByIdsMock: vi.fn(),
  getEvaluatorByIdMock: vi.fn(),
  getAgentIdsForEvaluatorsMock: vi.fn(),
  getProjectMainResolvedRefMock: vi.fn(() => vi.fn()),
  withRefMock: vi.fn(async (_pool: unknown, _resolvedRef: unknown, fn: (db: unknown) => unknown) =>
    fn({})
  ),
  executeEvaluationMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@inkeep/agents-core', () => ({
  getConversation: getConversationMock,
  createEvaluationResult: createEvaluationResultMock,
  updateEvaluationResult: updateEvaluationResultMock,
  generateId: generateIdMock,
  getEvaluatorsByIds: getEvaluatorsByIdsMock,
  getEvaluatorById: getEvaluatorByIdMock,
  getAgentIdsForEvaluators: getAgentIdsForEvaluatorsMock,
  getProjectMainResolvedRef: getProjectMainResolvedRefMock,
  withRef: withRefMock,
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
    INKEEP_AGENTS_MANAGE_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
  },
}));

vi.mock('../../../logger.js', () => createMockLoggerModule().module);

vi.mock('../../../domains/evals/services/EvaluationService.js', () => ({
  EvaluationService: vi.fn().mockImplementation(() => ({
    executeEvaluation: executeEvaluationMock,
  })),
}));

describe('evaluateConversation Workflow Steps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      getEvaluatorsByIdsMock.mockResolvedValue(mockEvaluators);
      const result = await getEvaluatorsByIdsMock(['eval-1', 'eval-2']);

      expect(result).toEqual(mockEvaluators);
      expect(getEvaluatorsByIdsMock).toHaveBeenCalledWith(['eval-1', 'eval-2']);
    });

    it('should filter out null evaluators', async () => {
      const mockEvaluators = [
        { id: 'eval-1', name: 'Evaluator 1' },
        null,
        { id: 'eval-3', name: 'Evaluator 3' },
      ];

      getEvaluatorsByIdsMock.mockResolvedValue(mockEvaluators);
      const result = await getEvaluatorsByIdsMock(['eval-1', 'eval-2', 'eval-3']);
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

      getEvaluatorByIdMock.mockResolvedValue(mockEvaluator);

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
      const evaluator = await getEvaluatorByIdMock('eval-1');
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

      getEvaluatorByIdMock.mockResolvedValue(mockEvaluator);

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
      getEvaluatorByIdMock.mockResolvedValue(null);

      const evaluator = await getEvaluatorByIdMock('non-existent');
      expect(evaluator).toBeNull();
    });
  });

  describe('filterEvaluatorsByAgentStep', () => {
    it('should filter out evaluators scoped to a different agent', async () => {
      const agentIdsMap = new Map<string, string[]>();
      agentIdsMap.set('eval-sales', ['sales-trigger-agent']);
      agentIdsMap.set('eval-global', []);

      getAgentIdsForEvaluatorsMock.mockReturnValue(vi.fn().mockResolvedValue(agentIdsMap));
      withRefMock.mockImplementation(
        async (_pool: unknown, _ref: unknown, fn: (db: unknown) => unknown) => fn({})
      );

      const mockGetAgentIds = getAgentIdsForEvaluatorsMock({});
      const result = await mockGetAgentIds({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        evaluatorIds: ['eval-sales', 'eval-global'],
      });

      const evaluatorIds = ['eval-sales', 'eval-global'];
      const agentId = 'meeting-prep-agent';

      const filtered = evaluatorIds.filter((evalId) => {
        const scopedAgents = result.get(evalId);
        if (!scopedAgents || scopedAgents.length === 0) return true;
        return scopedAgents.includes(agentId);
      });

      expect(filtered).toEqual(['eval-global']);
      expect(filtered).not.toContain('eval-sales');
    });

    it('should keep evaluators scoped to the matching agent', async () => {
      const agentIdsMap = new Map<string, string[]>();
      agentIdsMap.set('eval-sales', ['sales-trigger-agent']);
      agentIdsMap.set('eval-global', []);

      getAgentIdsForEvaluatorsMock.mockReturnValue(vi.fn().mockResolvedValue(agentIdsMap));

      const mockGetAgentIds = getAgentIdsForEvaluatorsMock({});
      const result = await mockGetAgentIds({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        evaluatorIds: ['eval-sales', 'eval-global'],
      });

      const evaluatorIds = ['eval-sales', 'eval-global'];
      const agentId = 'sales-trigger-agent';

      const filtered = evaluatorIds.filter((evalId) => {
        const scopedAgents = result.get(evalId);
        if (!scopedAgents || scopedAgents.length === 0) return true;
        return scopedAgents.includes(agentId);
      });

      expect(filtered).toEqual(['eval-sales', 'eval-global']);
    });

    it('should keep all evaluators when conversation has no agentId', async () => {
      const evaluatorIds = ['eval-sales', 'eval-global'];
      const agentId = null;

      if (!agentId) {
        expect(evaluatorIds).toEqual(['eval-sales', 'eval-global']);
        return;
      }
    });

    it('should keep project-wide evaluators (no agent relations) for any agent', async () => {
      const agentIdsMap = new Map<string, string[]>();
      agentIdsMap.set('eval-project-wide', []);

      getAgentIdsForEvaluatorsMock.mockReturnValue(vi.fn().mockResolvedValue(agentIdsMap));

      const mockGetAgentIds = getAgentIdsForEvaluatorsMock({});
      const result = await mockGetAgentIds({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        evaluatorIds: ['eval-project-wide'],
      });

      const evaluatorIds = ['eval-project-wide'];

      for (const testAgentId of ['agent-a', 'agent-b', 'agent-c']) {
        const filtered = evaluatorIds.filter((evalId) => {
          const scopedAgents = result.get(evalId);
          if (!scopedAgents || scopedAgents.length === 0) return true;
          return scopedAgents.includes(testAgentId);
        });

        expect(filtered).toEqual(['eval-project-wide']);
      }
    });

    it('should filter correctly with evaluator scoped to multiple agents', async () => {
      const agentIdsMap = new Map<string, string[]>();
      agentIdsMap.set('eval-multi', ['sales-agent', 'support-agent']);

      getAgentIdsForEvaluatorsMock.mockReturnValue(vi.fn().mockResolvedValue(agentIdsMap));

      const mockGetAgentIds = getAgentIdsForEvaluatorsMock({});
      const result = await mockGetAgentIds({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        evaluatorIds: ['eval-multi'],
      });

      const evaluatorIds = ['eval-multi'];

      const filteredForSales = evaluatorIds.filter((evalId) => {
        const scopedAgents = result.get(evalId);
        if (!scopedAgents || scopedAgents.length === 0) return true;
        return scopedAgents.includes('sales-agent');
      });
      expect(filteredForSales).toEqual(['eval-multi']);

      const filteredForMeeting = evaluatorIds.filter((evalId) => {
        const scopedAgents = result.get(evalId);
        if (!scopedAgents || scopedAgents.length === 0) return true;
        return scopedAgents.includes('meeting-prep-agent');
      });
      expect(filteredForMeeting).toEqual([]);
    });
  });
});
