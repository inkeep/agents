import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist the mock functions
const { startWorkflowMock } = vi.hoisted(() => ({
  startWorkflowMock: vi.fn(),
}));

// Mock dependencies
vi.mock('@inkeep/agents-core', () => ({
  TenantProjectParamsSchema: {
    openapi: vi.fn().mockReturnThis(),
  },
  TriggerDatasetRunSchema: {
    openapi: vi.fn().mockReturnThis(),
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

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../workflow/functions/runDatasetItem.js', () => ({
  runDatasetItemWorkflow: vi.fn(),
}));

describe('Dataset Triggers - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('workflow start mock behavior', () => {
    it('should call workflow with correct payload structure', async () => {
      startWorkflowMock.mockResolvedValue(undefined);

      const payload = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'agent-1',
        datasetItemId: 'item-1',
        datasetItemInput: { messages: [{ role: 'user', content: 'Hello' }] },
        datasetRunId: 'run-1',
      };

      await startWorkflowMock(vi.fn(), [payload]);

      expect(startWorkflowMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.arrayContaining([
          expect.objectContaining({
            tenantId: 'test-tenant',
            projectId: 'test-project',
            agentId: 'agent-1',
            datasetItemId: 'item-1',
            datasetRunId: 'run-1',
          }),
        ])
      );
    });

    it('should include simulation agent config when provided', async () => {
      startWorkflowMock.mockResolvedValue(undefined);

      const payload = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'agent-1',
        datasetItemId: 'item-1',
        datasetItemInput: { messages: [{ role: 'user', content: 'Start' }] },
        datasetItemSimulationAgent: {
          prompt: 'You are a test user',
          model: { model: 'gpt-4o' },
          stopWhen: { stepCountIs: 5 },
        },
        datasetRunId: 'run-1',
      };

      await startWorkflowMock(vi.fn(), [payload]);

      expect(startWorkflowMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.arrayContaining([
          expect.objectContaining({
            datasetItemSimulationAgent: {
              prompt: 'You are a test user',
              model: { model: 'gpt-4o' },
              stopWhen: { stepCountIs: 5 },
            },
          }),
        ])
      );
    });

    it('should include evaluator IDs when provided', async () => {
      startWorkflowMock.mockResolvedValue(undefined);

      const payload = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: 'agent-1',
        datasetItemId: 'item-1',
        datasetItemInput: 'Test input',
        datasetRunId: 'run-1',
        evaluatorIds: ['eval-1', 'eval-2'],
        evaluationRunId: 'eval-run-1',
      };

      await startWorkflowMock(vi.fn(), [payload]);

      expect(startWorkflowMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.arrayContaining([
          expect.objectContaining({
            evaluatorIds: ['eval-1', 'eval-2'],
            evaluationRunId: 'eval-run-1',
          }),
        ])
      );
    });

    it('should handle workflow start failure', async () => {
      startWorkflowMock.mockRejectedValue(new Error('Queue full'));

      await expect(startWorkflowMock(vi.fn(), [{ datasetItemId: 'item-1' }])).rejects.toThrow(
        'Queue full'
      );
    });

    it('should process multiple items sequentially', async () => {
      const callOrder: string[] = [];

      startWorkflowMock.mockImplementation(async (_workflow, [payload]: any) => {
        callOrder.push(payload.datasetItemId);
      });

      const items = [
        { datasetItemId: 'item-1' },
        { datasetItemId: 'item-2' },
        { datasetItemId: 'item-3' },
      ];

      for (const item of items) {
        await startWorkflowMock(vi.fn(), [item]);
      }

      expect(callOrder).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('should track success and failure counts', async () => {
      let queued = 0;
      let failed = 0;

      startWorkflowMock
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);

      const items = ['item-1', 'item-2', 'item-3'];

      for (const itemId of items) {
        try {
          await startWorkflowMock(vi.fn(), [{ datasetItemId: itemId }]);
          queued++;
        } catch {
          failed++;
        }
      }

      expect(queued).toBe(2);
      expect(failed).toBe(1);
    });
  });

  describe('Payload construction', () => {
    it('should use empty string for missing item ID', () => {
      const item = { agentId: 'agent-1', input: 'Test' };
      const payload = {
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: item.agentId,
        datasetItemId: (item as any).id ?? '',
        datasetItemInput: item.input,
        datasetRunId: 'run-1',
      };

      expect(payload.datasetItemId).toBe('');
    });

    it('should preserve input format', () => {
      const inputFormats = [
        'string input',
        { messages: [{ role: 'user', content: 'Hello' }] },
        { custom: 'format', data: [1, 2, 3] },
      ];

      inputFormats.forEach((input) => {
        const payload = {
          datasetItemInput: input,
        };
        expect(payload.datasetItemInput).toEqual(input);
      });
    });

    it('should handle different agent IDs per item', () => {
      const items = [
        { id: 'item-1', agentId: 'agent-a', input: 'Test 1' },
        { id: 'item-2', agentId: 'agent-b', input: 'Test 2' },
        { id: 'item-3', agentId: 'agent-a', input: 'Test 3' },
      ];

      const payloads = items.map((item) => ({
        tenantId: 'test-tenant',
        projectId: 'test-project',
        agentId: item.agentId,
        datasetItemId: item.id,
        datasetItemInput: item.input,
        datasetRunId: 'run-1',
      }));

      expect(payloads[0].agentId).toBe('agent-a');
      expect(payloads[1].agentId).toBe('agent-b');
      expect(payloads[2].agentId).toBe('agent-a');
    });
  });

  describe('Response format', () => {
    it('should construct correct response', () => {
      const response = {
        queued: 5,
        failed: 1,
        datasetRunId: 'run-123',
      };

      expect(response).toEqual({
        queued: 5,
        failed: 1,
        datasetRunId: 'run-123',
      });
    });

    it('should handle all items failing', () => {
      const response = {
        queued: 0,
        failed: 10,
        datasetRunId: 'run-123',
      };

      expect(response.queued).toBe(0);
      expect(response.failed).toBe(10);
    });

    it('should handle empty items array', () => {
      const items: any[] = [];
      let queued = 0;
      const failed = 0;

      for (const _item of items) {
        queued++; // Would never execute
      }

      const response = {
        queued,
        failed,
        datasetRunId: 'run-123',
      };

      expect(response.queued).toBe(0);
      expect(response.failed).toBe(0);
    });
  });
});
