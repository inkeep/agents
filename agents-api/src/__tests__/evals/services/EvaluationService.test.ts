import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generateIdMock,
  getConversationHistoryMock,
  resolveRefMock,
  withRefMock,
  getProjectScopedRefMock,
  getFullAgentMock,
  ModelFactoryMock,
} = vi.hoisted(() => ({
  generateIdMock: vi.fn(() => 'test-generated-id'),
  getConversationHistoryMock: vi.fn(() => vi.fn()),
  resolveRefMock: vi.fn(() => vi.fn(async () => ({ hash: 'test-ref-hash' }))),
  withRefMock: vi.fn(
    async (_pool: unknown, _ref: unknown, fn: (db: unknown) => unknown) => fn({})
  ),
  getProjectScopedRefMock: vi.fn(() => ({ tenantId: 't', projectId: 'p', branch: 'main' })),
  getFullAgentMock: vi.fn(() => vi.fn()),
  ModelFactoryMock: {
    prepareGenerationConfig: vi.fn(() => ({
      model: vi.fn(),
    })),
  },
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    generateId: generateIdMock,
    getConversationHistory: getConversationHistoryMock,
    resolveRef: resolveRefMock,
    withRef: withRefMock,
    getProjectScopedRef: getProjectScopedRefMock,
    getFullAgent: getFullAgentMock,
    ModelFactory: ModelFactoryMock,
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../data/db/manageDbPool.js', () => ({
  default: {},
}));

vi.mock('../../../data/db/manageDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3003',
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: 'test-bypass-secret',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
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

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn((opts: unknown) => opts) },
}));

import { EvaluationService } from '../../../domains/evals/services/EvaluationService';

describe('EvaluationService', () => {
  let evaluationService: EvaluationService;

  beforeEach(() => {
    vi.clearAllMocks();
    evaluationService = new EvaluationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeEvaluation', () => {
    it('should throw when ref resolution fails', async () => {
      resolveRefMock.mockReturnValue(vi.fn(async () => null as any));

      await expect(
        evaluationService.executeEvaluation({
          conversation: {
            id: 'conv-1',
            ref: null,
            agentId: 'agent-1',
          } as any,
          evaluator: {
            id: 'eval-1',
            prompt: 'Evaluate this',
            schema: { type: 'object', properties: { score: { type: 'number' } } },
            model: null,
          } as any,
          tenantId: 'test-tenant',
          projectId: 'test-project',
        })
      ).rejects.toThrow('Failed to resolve ref');
    });

    it('should use conversation ref when available', async () => {
      const conversationRef = { hash: 'conv-ref-hash' };

      getConversationHistoryMock.mockReturnValue(vi.fn(async () => []));
      getFullAgentMock.mockReturnValue(vi.fn(async () => null));

      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValue({
        experimental_output: { score: 5 },
        text: '',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      } as any);

      const result = await evaluationService.executeEvaluation({
        conversation: {
          id: 'conv-1',
          ref: conversationRef,
          agentId: 'agent-1',
        } as any,
        evaluator: {
          id: 'eval-1',
          prompt: 'Evaluate this',
          schema: { type: 'object', properties: { score: { type: 'number' } } },
          model: null,
        } as any,
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });

      expect(resolveRefMock).not.toHaveBeenCalled();
      expect(result.output).toEqual({ score: 5 });
    });
  });
});
