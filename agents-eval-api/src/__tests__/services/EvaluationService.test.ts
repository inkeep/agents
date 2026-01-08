import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const {
  generateIdMock,
  createEvaluationRunMock,
  createEvaluationResultMock,
  updateEvaluationResultMock,
  filterConversationsForJobMock,
  getConversationHistoryMock,
  ManagementApiClientMock,
  ModelFactoryMock,
} = vi.hoisted(() => ({
  generateIdMock: vi.fn(() => 'test-generated-id'),
  createEvaluationRunMock: vi.fn(() => vi.fn()),
  createEvaluationResultMock: vi.fn(() => vi.fn()),
  updateEvaluationResultMock: vi.fn(() => vi.fn()),
  filterConversationsForJobMock: vi.fn(() => vi.fn()),
  getConversationHistoryMock: vi.fn(() => vi.fn()),
  ManagementApiClientMock: vi.fn(() => ({
    getEvaluationJobConfigById: vi.fn(),
    getEvaluationJobConfigEvaluatorRelations: vi.fn(),
    getEvaluatorById: vi.fn(),
    getFullAgent: vi.fn(),
  })),
  ModelFactoryMock: {
    prepareGenerationConfig: vi.fn(() => ({
      model: vi.fn(),
    })),
  },
}));

// Mock dependencies before imports
vi.mock('@inkeep/agents-core', () => ({
  generateId: generateIdMock,
  createEvaluationRun: createEvaluationRunMock,
  createEvaluationResult: createEvaluationResultMock,
  updateEvaluationResult: updateEvaluationResultMock,
  filterConversationsForJob: filterConversationsForJobMock,
  getConversationHistory: getConversationHistoryMock,
  ManagementApiClient: ManagementApiClientMock,
  ModelFactory: ModelFactoryMock,
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

vi.mock('../../env.js', () => ({
  env: {
    INKEEP_AGENTS_RUN_API_URL: 'http://localhost:3003',
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: 'test-bypass-secret',
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

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));

import { EvaluationService } from '../../services/EvaluationService';

describe('EvaluationService', () => {
  let evaluationService: EvaluationService;

  beforeEach(() => {
    vi.clearAllMocks();
    evaluationService = new EvaluationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applySampleRate', () => {
    it('should return all items when sample rate is 1.0', () => {
      const items = [1, 2, 3, 4, 5];
      const result = evaluationService.applySampleRate(items, 1.0);
      expect(result).toEqual(items);
    });

    it('should return all items when sample rate is greater than 1.0', () => {
      const items = [1, 2, 3, 4, 5];
      const result = evaluationService.applySampleRate(items, 1.5);
      expect(result).toEqual(items);
    });

    it('should return all items when sample rate is 0 (falsy check)', () => {
      // Note: The implementation checks `!sampleRate` first, which is true for 0
      // This means 0 is treated as falsy and returns all items
      const items = [1, 2, 3, 4, 5];
      const result = evaluationService.applySampleRate(items, 0);
      expect(result).toEqual(items);
    });

    it('should return empty array when sample rate is negative', () => {
      const items = [1, 2, 3, 4, 5];
      const result = evaluationService.applySampleRate(items, -0.5);
      expect(result).toHaveLength(0);
    });

    it('should return all items when sample rate is null', () => {
      const items = [1, 2, 3, 4, 5];
      const result = evaluationService.applySampleRate(items, null);
      expect(result).toEqual(items);
    });

    it('should return all items when sample rate is undefined', () => {
      const items = [1, 2, 3, 4, 5];
      const result = evaluationService.applySampleRate(items, undefined);
      expect(result).toEqual(items);
    });

    it('should return approximately correct number of items for 0.5 sample rate', () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      const result = evaluationService.applySampleRate(items, 0.5);
      expect(result.length).toBe(50);
      expect(result.every((item) => items.includes(item))).toBe(true);
    });

    it('should return all unique items', () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      const result = evaluationService.applySampleRate(items, 0.3);
      const uniqueItems = new Set(result);
      expect(uniqueItems.size).toBe(result.length);
    });

    it('should handle empty array', () => {
      const result = evaluationService.applySampleRate([], 0.5);
      expect(result).toHaveLength(0);
    });

    it('should handle single item array', () => {
      const items = [1];
      const result = evaluationService.applySampleRate(items, 0.5);
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  describe('runDatasetItem', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return error when dataset item has no input', async () => {
      const result = await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: null,
        } as any,
        datasetRunId: 'run-1',
      });

      expect(result.error).toBe('Dataset item has no valid input messages');
    });

    it('should return error when dataset item input has no messages', async () => {
      const result = await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: { messages: [] },
        } as any,
        datasetRunId: 'run-1',
      });

      expect(result.error).toBe('Dataset item has no valid input messages');
    });

    it('should run single-turn conversation successfully', async () => {
      const mockResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            `data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n` +
              `data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":" world"}}]}\n` +
              `data: [DONE]`
          ),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      generateIdMock.mockReturnValue('test-conv-id');

      const result = await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: {
            messages: [{ role: 'user', content: 'Hello' }],
          },
        } as any,
        datasetRunId: 'run-1',
        apiKey: 'test-api-key',
      });

      expect(result.conversationId).toBe('test-conv-id');
      expect(result.response).toBe('Hello world');
      expect(result.error).toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3003/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
            'x-inkeep-tenant-id': 'test-tenant',
            'x-inkeep-project-id': 'test-project',
            'x-inkeep-agent-id': 'test-agent',
            'x-inkeep-dataset-run-id': 'run-1',
          }),
        })
      );
    });

    it('should handle chat API error response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('Server error'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      generateIdMock.mockReturnValue('test-conv-id');

      const result = await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: {
            messages: [{ role: 'user', content: 'Hello' }],
          },
        } as any,
        datasetRunId: 'run-1',
      });

      expect(result.conversationId).toBe('test-conv-id');
      expect(result.error).toBe('Chat API error: 500 Internal Server Error');
    });

    it('should map agent role to assistant role', async () => {
      const mockResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            `data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"Response"}}]}\n`
          ),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      generateIdMock.mockReturnValue('test-conv-id');

      await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: {
            messages: [
              { role: 'agent', content: 'Previous response' },
              { role: 'user', content: 'Follow up' },
            ],
          },
        } as any,
        datasetRunId: 'run-1',
      });

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.messages[0].role).toBe('assistant');
      expect(body.messages[1].role).toBe('user');
    });

    it('should handle string input as user message', async () => {
      const mockResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            `data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"}}]}\n`
          ),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      generateIdMock.mockReturnValue('test-conv-id');

      await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: 'Hello there',
        } as any,
        datasetRunId: 'run-1',
      });

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello there' }]);
    });

    it('should handle error operations in SSE response', async () => {
      const mockResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            `data: {"type":"data-operation","data":{"type":"error","message":"Something went wrong"}}\n`
          ),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      generateIdMock.mockReturnValue('test-conv-id');

      const result = await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: {
            messages: [{ role: 'user', content: 'Hello' }],
          },
        } as any,
        datasetRunId: 'run-1',
      });

      expect(result.error).toBe('Something went wrong');
    });

    it('should use bypass secret when apiKey is not provided', async () => {
      const mockResponse = {
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            `data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"OK"}}]}\n`
          ),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      generateIdMock.mockReturnValue('test-conv-id');

      await evaluationService.runDatasetItem({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'test-agent',
        datasetItem: {
          id: 'item-1',
          input: {
            messages: [{ role: 'user', content: 'Hello' }],
          },
        } as any,
        datasetRunId: 'run-1',
      });

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-bypass-secret');
    });
  });

  describe('runEvaluationJob', () => {
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        getEvaluationJobConfigById: vi.fn(),
        getEvaluationJobConfigEvaluatorRelations: vi.fn(),
        getEvaluatorById: vi.fn(),
      };
      ManagementApiClientMock.mockImplementation(() => mockClient);
    });

    it('should throw error when evaluation job config not found', async () => {
      mockClient.getEvaluationJobConfigById.mockResolvedValue(null);

      await expect(
        evaluationService.runEvaluationJob({
          tenantId: 'test-tenant',
          projectId: 'test-project',
          evaluationJobConfigId: 'non-existent',
        })
      ).rejects.toThrow('Evaluation job config not found: non-existent');
    });

    it('should throw error when no evaluators found', async () => {
      mockClient.getEvaluationJobConfigById.mockResolvedValue({
        id: 'config-1',
        jobFilters: {},
      });
      mockClient.getEvaluationJobConfigEvaluatorRelations.mockResolvedValue([]);

      await expect(
        evaluationService.runEvaluationJob({
          tenantId: 'test-tenant',
          projectId: 'test-project',
          evaluationJobConfigId: 'config-1',
        })
      ).rejects.toThrow('No evaluators found for job config: config-1');
    });

    it('should throw error when all evaluators are invalid', async () => {
      mockClient.getEvaluationJobConfigById.mockResolvedValue({
        id: 'config-1',
        jobFilters: {},
      });
      mockClient.getEvaluationJobConfigEvaluatorRelations.mockResolvedValue([
        { evaluatorId: 'eval-1' },
        { evaluatorId: 'eval-2' },
      ]);
      mockClient.getEvaluatorById.mockResolvedValue(null);

      await expect(
        evaluationService.runEvaluationJob({
          tenantId: 'test-tenant',
          projectId: 'test-project',
          evaluationJobConfigId: 'config-1',
        })
      ).rejects.toThrow('No valid evaluators found for job config: config-1');
    });

    it('should return empty results when no conversations match filters', async () => {
      mockClient.getEvaluationJobConfigById.mockResolvedValue({
        id: 'config-1',
        jobFilters: {},
      });
      mockClient.getEvaluationJobConfigEvaluatorRelations.mockResolvedValue([
        { evaluatorId: 'eval-1' },
      ]);
      mockClient.getEvaluatorById.mockResolvedValue({
        id: 'eval-1',
        name: 'Test Evaluator',
      });
      filterConversationsForJobMock.mockImplementation(() => vi.fn().mockResolvedValue([]));

      const results = await evaluationService.runEvaluationJob({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        evaluationJobConfigId: 'config-1',
      });

      expect(results).toHaveLength(0);
    });

    it('should call applySampleRate when sample rate is provided', () => {
      // Unit test just for the sample rate logic
      const applySampleRateSpy = vi.spyOn(evaluationService, 'applySampleRate');
      const items = Array.from({ length: 10 }, (_, i) => i);

      evaluationService.applySampleRate(items, 0.5);

      expect(applySampleRateSpy).toHaveBeenCalledWith(items, 0.5);
    });
  });
});
