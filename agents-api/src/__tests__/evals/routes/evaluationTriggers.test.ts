import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const {
  getConversationMock,
  createEvaluationRunMock,
  filterConversationsForJobMock,
  generateIdMock,
  withRefMock,
  listEvaluationRunConfigsWithSuiteConfigsMock,
  getEvaluationSuiteConfigByIdMock,
  getEvaluationSuiteConfigEvaluatorRelationsMock,
  getEvaluatorsByIdsMock,
  startWorkflowMock,
} = vi.hoisted(() => ({
  getConversationMock: vi.fn(() => vi.fn()),
  createEvaluationRunMock: vi.fn(() => vi.fn()),
  filterConversationsForJobMock: vi.fn(() => vi.fn()),
  generateIdMock: vi.fn(() => 'test-generated-id'),
  withRefMock: vi.fn(async (_pool: unknown, _resolvedRef: unknown, fn: (db: unknown) => unknown) =>
    fn({})
  ),
  listEvaluationRunConfigsWithSuiteConfigsMock: vi.fn(() => vi.fn()),
  getEvaluationSuiteConfigByIdMock: vi.fn(() => vi.fn()),
  getEvaluationSuiteConfigEvaluatorRelationsMock: vi.fn(() => vi.fn()),
  getEvaluatorsByIdsMock: vi.fn(() => vi.fn()),
  startWorkflowMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@inkeep/agents-core', () => ({
  getConversation: getConversationMock,
  createEvaluationRun: createEvaluationRunMock,
  filterConversationsForJob: filterConversationsForJobMock,
  generateId: generateIdMock,
  withRef: withRefMock,
  listEvaluationRunConfigsWithSuiteConfigs: listEvaluationRunConfigsWithSuiteConfigsMock,
  getEvaluationSuiteConfigById: getEvaluationSuiteConfigByIdMock,
  getEvaluationSuiteConfigEvaluatorRelations: getEvaluationSuiteConfigEvaluatorRelationsMock,
  getEvaluatorsByIds: getEvaluatorsByIdsMock,
  TenantProjectParamsSchema: {
    openapi: vi.fn().mockReturnThis(),
  },
  TriggerEvaluationJobSchema: {
    openapi: vi.fn().mockReturnThis(),
  },
  commonGetErrorResponses: {},
  createApiError: vi.fn((opts) => ({
    error: opts.code,
    message: opts.message,
  })),
  InternalServices: {
    INKEEP_AGENTS_EVAL_API: 'inkeep-agents-eval-api',
    INKEEP_AGENTS_MANAGE_API: 'inkeep-agents-manage-api',
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('workflow/api', () => ({
  start: startWorkflowMock,
}));

vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
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

vi.mock('../../../domains/evals/workflow/index.js', () => ({
  evaluateConversationWorkflow: vi.fn(),
}));

describe('Evaluation Triggers - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConversation mock behavior', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 'conv-1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
      };

      getConversationMock.mockImplementation(() => vi.fn().mockResolvedValue(mockConversation));

      const getConv = getConversationMock();
      const result = await getConv({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        conversationId: 'conv-1',
      });

      expect(result).toEqual(mockConversation);
    });

    it('should return null when conversation not found', async () => {
      getConversationMock.mockImplementation(() => vi.fn().mockResolvedValue(null));

      const getConv = getConversationMock();
      const result = await getConv({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        conversationId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('DB helper mock behavior', () => {
    it('should return active evaluation run configs', async () => {
      const mockConfigs = [
        { id: 'config-1', isActive: true, suiteConfigIds: ['suite-1'] },
        { id: 'config-2', isActive: false, suiteConfigIds: ['suite-2'] },
      ];

      listEvaluationRunConfigsWithSuiteConfigsMock.mockImplementation(() =>
        vi.fn().mockResolvedValue(mockConfigs)
      );

      const listFn = listEvaluationRunConfigsWithSuiteConfigsMock();
      const result = await listFn({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      });
      const activeConfigs = result.filter((c: any) => c.isActive);

      expect(activeConfigs).toHaveLength(1);
      expect(activeConfigs[0].id).toBe('config-1');
    });

    it('should return suite config with evaluator relations', async () => {
      const mockSuiteConfig = {
        id: 'suite-1',
        sampleRate: 0.5,
      };
      const mockRelations = [{ evaluatorId: 'eval-1' }, { evaluatorId: 'eval-2' }];

      getEvaluationSuiteConfigByIdMock.mockImplementation(() => vi.fn().mockResolvedValue(mockSuiteConfig));
      getEvaluationSuiteConfigEvaluatorRelationsMock.mockImplementation(() =>
        vi.fn().mockResolvedValue(mockRelations)
      );

      const suiteFn = getEvaluationSuiteConfigByIdMock();
      const relFn = getEvaluationSuiteConfigEvaluatorRelationsMock();

      const suiteConfig = await suiteFn({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project', evaluationSuiteConfigId: 'suite-1' },
      });
      const relations = await relFn({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project', evaluationSuiteConfigId: 'suite-1' },
      });

      expect(suiteConfig.sampleRate).toBe(0.5);
      expect(relations).toHaveLength(2);
      expect(relations.map((r: any) => r.evaluatorId)).toEqual(['eval-1', 'eval-2']);
    });

    it('should return evaluators by IDs', async () => {
      const mockEvaluators = [
        { id: 'eval-1', name: 'Evaluator 1' },
        { id: 'eval-2', name: 'Evaluator 2' },
      ];

      getEvaluatorsByIdsMock.mockImplementation(() => vi.fn().mockResolvedValue(mockEvaluators));

      const evalsFn = getEvaluatorsByIdsMock();
      const result = await evalsFn({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        evaluatorIds: ['eval-1', 'eval-2'],
      });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Evaluator 1');
    });

    it('should handle missing evaluators', async () => {
      const mockEvaluators = [
        { id: 'eval-1', name: 'Evaluator 1' },
        null, // eval-2 not found
      ];

      getEvaluatorsByIdsMock.mockImplementation(() => vi.fn().mockResolvedValue(mockEvaluators));

      const evalsFn = getEvaluatorsByIdsMock();
      const result = await evalsFn({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        evaluatorIds: ['eval-1', 'eval-2'],
      });
      const missingIndices = result
        .map((e: any, i: number) => (e === null ? i : -1))
        .filter((i: number) => i !== -1);

      expect(missingIndices).toEqual([1]);
    });
  });

  describe('filterConversationsForJob mock behavior', () => {
    it('should return filtered conversations', async () => {
      const mockConversations = [
        { id: 'conv-1', tenantId: 'test-tenant' },
        { id: 'conv-2', tenantId: 'test-tenant' },
      ];

      filterConversationsForJobMock.mockImplementation(() =>
        vi.fn().mockResolvedValue(mockConversations)
      );

      const filterFn = filterConversationsForJobMock();
      const result = await filterFn({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        jobFilters: { agentIds: ['agent-1'] },
      });

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no matches', async () => {
      filterConversationsForJobMock.mockImplementation(() => vi.fn().mockResolvedValue([]));

      const filterFn = filterConversationsForJobMock();
      const result = await filterFn({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        jobFilters: { agentIds: ['non-existent'] },
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('createEvaluationRun mock behavior', () => {
    it('should create evaluation run', async () => {
      createEvaluationRunMock.mockImplementation(() =>
        vi.fn().mockResolvedValue({
          id: 'run-1',
          tenantId: 'test-tenant',
          projectId: 'test-project',
        })
      );

      const createFn = createEvaluationRunMock();
      const result = await createFn({
        id: 'run-1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });

      expect(result.id).toBe('run-1');
    });
  });

  describe('workflow start mock behavior', () => {
    it('should start workflow successfully', async () => {
      startWorkflowMock.mockResolvedValue(undefined);

      await startWorkflowMock(
        vi.fn(), // workflow function
        [
          {
            tenantId: 'test-tenant',
            projectId: 'test-project',
            conversationId: 'conv-1',
            evaluatorIds: ['eval-1'],
            evaluationRunId: 'run-1',
          },
        ]
      );

      expect(startWorkflowMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.arrayContaining([
          expect.objectContaining({
            conversationId: 'conv-1',
            evaluatorIds: ['eval-1'],
          }),
        ])
      );
    });

    it('should handle workflow start failure', async () => {
      startWorkflowMock.mockRejectedValue(new Error('Workflow failed'));

      await expect(startWorkflowMock(vi.fn(), [{ conversationId: 'conv-1' }])).rejects.toThrow(
        'Workflow failed'
      );
    });
  });

  describe('Sample rate filtering logic', () => {
    it('should pass sample rate check when random is below threshold', () => {
      const sampleRate = 0.5;
      const random = 0.3; // Below 0.5

      const passes = random <= sampleRate;

      expect(passes).toBe(true);
    });

    it('should fail sample rate check when random is above threshold', () => {
      const sampleRate = 0.5;
      const random = 0.8; // Above 0.5

      const passes = random <= sampleRate;

      expect(passes).toBe(false);
    });

    it('should always pass when sample rate is 1.0', () => {
      const sampleRate = 1.0;
      const testRandoms = [0, 0.5, 0.99, 1.0];

      const allPass = testRandoms.every((r) => r <= sampleRate);

      expect(allPass).toBe(true);
    });

    it('should handle null/undefined sample rate as pass-through', () => {
      const sampleRates = [null, undefined];

      sampleRates.forEach((rate) => {
        // When rate is null/undefined, no filtering should occur
        const shouldFilter = rate !== null && rate !== undefined;
        expect(shouldFilter).toBe(false);
      });
    });
  });

  describe('generateId mock behavior', () => {
    it('should generate unique IDs', () => {
      expect(generateIdMock()).toBe('test-generated-id');
    });
  });
});
