import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveRefMock } = vi.hoisted(() => ({
  resolveRefMock: vi.fn(() => vi.fn(async () => ({ hash: 'test-ref-hash' }))),
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    resolveRef: resolveRefMock,
    getProjectScopedRef: vi.fn(() => ({ tenantId: 't', projectId: 'p', branch: 'main' })),
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

vi.mock('../../../data/db/runDbClient.js', () => ({ default: {} }));
vi.mock('../../../data/db/manageDbPool.js', () => ({ default: {} }));
vi.mock('../../../data/db/manageDbClient.js', () => ({ default: {} }));

vi.mock('../../../env.js', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3003',
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: 'test-bypass-secret',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
  },
}));

vi.mock('../../../logger.js', () => createMockLoggerModule().module);

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
  });
});
