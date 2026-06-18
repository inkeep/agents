import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', () => ({
  createDatasetRun: vi.fn(),
  createEvaluationJobConfig: vi.fn(),
  createEvaluationJobConfigEvaluatorRelation: vi.fn(),
  createEvaluationRun: vi.fn(),
  createScheduledTriggerInvocation: vi.fn(),
  generateId: vi.fn(() => 'gen-id'),
  getAgentDatasetRelationsByDataset: vi.fn(),
  getDatasetRunById: vi.fn(),
  getDatasetRunConfigAgentRelations: vi.fn(),
  getDatasetRunConfigById: vi.fn(),
  getPostgresErrorCode: vi.fn(),
  getScheduledTriggerInvocationByIdempotencyKey: vi.fn(),
  linkDatasetRunToEvaluationJobConfig: vi.fn(),
  listDatasetItems: vi.fn(),
  listEvaluationRunsByJobConfigId: vi.fn(),
  markScheduledTriggerInvocationFailed: vi.fn(),
  SCHEDULED_TRIGGER_DEFAULT_DISPATCH_DELAY_MS: 120_000,
}));

vi.mock('../../../../data/db/runDbClient', () => ({
  default: 'mock-run-client',
}));

vi.mock('workflow/api', () => ({
  start: vi.fn(),
}));

vi.mock('../../../../logger', () => createMockLoggerModule().module);

vi.mock('../../workflow/functions/runDatasetItem', () => ({
  runDatasetItemWorkflow: 'mock-run-dataset-item-workflow',
}));

import {
  createDatasetRun,
  createScheduledTriggerInvocation,
  getAgentDatasetRelationsByDataset,
  getDatasetRunConfigAgentRelations,
  getDatasetRunConfigById,
  getPostgresErrorCode,
  getScheduledTriggerInvocationByIdempotencyKey,
  listDatasetItems,
  markScheduledTriggerInvocationFailed,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import { executeDatasetRun, queueDatasetRunItems } from '../datasetRun';

const mockGetConfig = getDatasetRunConfigById as ReturnType<typeof vi.fn>;
const mockListItems = listDatasetItems as ReturnType<typeof vi.fn>;
const mockGetAgentRelations = getDatasetRunConfigAgentRelations as ReturnType<typeof vi.fn>;
const mockGetDatasetAgentRelations = getAgentDatasetRelationsByDataset as ReturnType<typeof vi.fn>;
const mockCreateRun = createDatasetRun as ReturnType<typeof vi.fn>;
const mockCreateInvocation = createScheduledTriggerInvocation as ReturnType<typeof vi.fn>;
const mockGetPostgresErrorCode = getPostgresErrorCode as ReturnType<typeof vi.fn>;
const mockGetInvocationByKey = getScheduledTriggerInvocationByIdempotencyKey as ReturnType<
  typeof vi.fn
>;
const mockStart = start as ReturnType<typeof vi.fn>;
const mockMarkFailed = markScheduledTriggerInvocationFailed as ReturnType<typeof vi.fn>;

const fakeManageDb = {} as any;

function makeDatasetItem(id: string) {
  return {
    id,
    input: { messages: [{ role: 'user', content: `Item ${id}` }] },
    expectedOutput: null,
  };
}

describe('executeDatasetRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetConfig.mockReturnValue(() =>
      Promise.resolve({ datasetId: 'dataset-1', name: 'test-config' })
    );
    mockListItems.mockReturnValue(() =>
      Promise.resolve([makeDatasetItem('item-1'), makeDatasetItem('item-2')])
    );
    mockGetAgentRelations.mockReturnValue(() =>
      Promise.resolve([{ agentId: 'agent-1' }, { agentId: 'agent-2' }])
    );
    mockGetDatasetAgentRelations.mockReturnValue(() => Promise.resolve([]));
    mockCreateRun.mockReturnValue(() => Promise.resolve());
    mockCreateInvocation.mockReturnValue(() => Promise.resolve({ id: 'inv-id' }));
    mockStart.mockResolvedValue(undefined);
    mockMarkFailed.mockReturnValue(() => Promise.resolve());
  });

  const baseParams = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    datasetRunConfigId: 'config-1',
    agentIds: ['agent-1', 'agent-2'],
    manageDb: fakeManageDb,
  };

  describe('agent filtering', () => {
    it('only runs agents present in the config', async () => {
      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));
      mockListItems.mockReturnValue(() => Promise.resolve([makeDatasetItem('item-1')]));

      const result = await executeDatasetRun({
        ...baseParams,
        agentIds: ['agent-1', 'agent-3'],
      });

      expect(result.totalItems).toBe(1);
    });

    it('throws when no requested agents are in the config', async () => {
      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));

      await expect(executeDatasetRun({ ...baseParams, agentIds: ['agent-99'] })).rejects.toThrow(
        'None of the requested agents are configured'
      );
    });

    it('filters by dataset-agent scoping when relations exist', async () => {
      mockGetDatasetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));

      const result = await executeDatasetRun(baseParams);

      expect(result.totalItems).toBe(2);
    });

    it('throws when no agents are scoped to the dataset', async () => {
      mockGetDatasetAgentRelations.mockReturnValue(() =>
        Promise.resolve([{ agentId: 'agent-99' }])
      );

      await expect(executeDatasetRun(baseParams)).rejects.toThrow(
        'None of the requested agents are scoped to this dataset'
      );
    });
  });

  describe('idempotency', () => {
    it('proceeds when dataset run already exists (23505)', async () => {
      const duplicateErr = new Error('duplicate');
      mockCreateRun.mockReturnValue(() => Promise.reject(duplicateErr));
      mockGetPostgresErrorCode.mockReturnValue('23505');

      const result = await executeDatasetRun(baseParams);

      expect(result.datasetRunId).toBeDefined();
    });

    it('re-throws non-duplicate run creation errors', async () => {
      const otherErr = new Error('connection failed');
      mockCreateRun.mockReturnValue(() => Promise.reject(otherErr));
      mockGetPostgresErrorCode.mockReturnValue(null);

      await expect(executeDatasetRun(baseParams)).rejects.toThrow('connection failed');
    });

    it('recovers pending invocations on duplicate key', async () => {
      let callCount = 0;
      mockCreateInvocation.mockReturnValue(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('dup'));
        return Promise.resolve({ id: `inv-${callCount}` });
      });

      mockGetPostgresErrorCode.mockImplementation((err: unknown) =>
        err instanceof Error && err.message === 'dup' ? '23505' : null
      );
      mockGetInvocationByKey.mockReturnValue(() =>
        Promise.resolve({ id: 'recovered-inv', status: 'pending' })
      );

      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));

      const result = await executeDatasetRun({
        ...baseParams,
        agentIds: ['agent-1'],
      });

      expect(result.totalItems).toBe(2);
      expect(result.failedInvocations).toBe(0);
    });

    it('skips already-dispatched invocations on retry', async () => {
      let callCount = 0;
      mockCreateInvocation.mockReturnValue(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('dup'));
        return Promise.resolve({ id: `inv-${callCount}` });
      });

      mockGetPostgresErrorCode.mockImplementation((err: unknown) =>
        err instanceof Error && err.message === 'dup' ? '23505' : null
      );
      mockGetInvocationByKey.mockReturnValue(() =>
        Promise.resolve({ id: 'old-inv', status: 'completed' })
      );

      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));

      const result = await executeDatasetRun({
        ...baseParams,
        agentIds: ['agent-1'],
      });

      expect(result.skippedInvocations).toBe(1);
      expect(result.failedInvocations).toBe(0);
      expect(result.totalItems).toBe(1);
    });

    it('generates idempotency keys as {datasetRunId}-{agentId}-{itemId}', async () => {
      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));
      mockListItems.mockReturnValue(() =>
        Promise.resolve([makeDatasetItem('item-A'), makeDatasetItem('item-B')])
      );

      const invocationArgs: any[] = [];
      mockCreateInvocation.mockReturnValue((args: any) => {
        invocationArgs.push(args);
        return Promise.resolve({ id: `inv-${invocationArgs.length}` });
      });

      await executeDatasetRun({
        ...baseParams,
        agentIds: ['agent-1'],
        datasetRunId: 'run-123',
      });

      expect(invocationArgs).toHaveLength(2);
      expect(invocationArgs[0].idempotencyKey).toBe('run-123-agent-1-item-A');
      expect(invocationArgs[1].idempotencyKey).toBe('run-123-agent-1-item-B');
    });

    it('uses scheduledTriggerIdByAgent for per-agent trigger scoping', async () => {
      mockGetAgentRelations.mockReturnValue(() =>
        Promise.resolve([{ agentId: 'agent-1' }, { agentId: 'agent-2' }])
      );
      mockListItems.mockReturnValue(() => Promise.resolve([makeDatasetItem('item-1')]));

      const invocationArgs: any[] = [];
      mockCreateInvocation.mockReturnValue((args: any) => {
        invocationArgs.push(args);
        return Promise.resolve({ id: `inv-${invocationArgs.length}` });
      });

      await executeDatasetRun({
        ...baseParams,
        scheduledTriggerIdByAgent: {
          'agent-1': 'trigger-A',
          'agent-2': 'trigger-B',
        },
      });

      expect(invocationArgs[0].scheduledTriggerId).toBe('trigger-A');
      expect(invocationArgs[1].scheduledTriggerId).toBe('trigger-B');
    });
  });

  describe('partial failure handling', () => {
    it('reports failedInvocations for non-duplicate creation errors', async () => {
      let callCount = 0;
      mockCreateInvocation.mockReturnValue(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('transient'));
        return Promise.resolve({ id: `inv-${callCount}` });
      });
      mockGetPostgresErrorCode.mockReturnValue(null);

      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));

      const result = await executeDatasetRun({
        ...baseParams,
        agentIds: ['agent-1'],
      });

      expect(result.failedInvocations).toBe(1);
      expect(result.totalItems).toBe(1);
    });

    it('reports failedQueueing from workflow start failures', async () => {
      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));
      mockListItems.mockReturnValue(() => Promise.resolve([makeDatasetItem('item-1')]));

      mockStart.mockRejectedValueOnce(new Error('workflow start failed'));

      const result = await executeDatasetRun({
        ...baseParams,
        agentIds: ['agent-1'],
      });

      expect(result.failedQueueing).toBe(1);
      expect(result.totalItems).toBe(0);
    });

    it('returns zero totalItems when all invocations fail', async () => {
      mockCreateInvocation.mockReturnValue(() => Promise.reject(new Error('all fail')));
      mockGetPostgresErrorCode.mockReturnValue(null);

      mockGetAgentRelations.mockReturnValue(() => Promise.resolve([{ agentId: 'agent-1' }]));
      mockListItems.mockReturnValue(() => Promise.resolve([makeDatasetItem('item-1')]));

      const result = await executeDatasetRun({
        ...baseParams,
        agentIds: ['agent-1'],
      });

      expect(result.totalItems).toBe(0);
      expect(result.failedInvocations).toBe(1);
      expect(result.failedQueueing).toBe(0);
      expect(mockStart).not.toHaveBeenCalled();
    });
  });
});

describe('queueDatasetRunItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    mockMarkFailed.mockReturnValue(() => Promise.resolve());
  });

  it('returns queued and failed counts', async () => {
    mockStart.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('fail'));

    const result = await queueDatasetRunItems({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      datasetRunId: 'run-1',
      items: [
        {
          agentId: 'agent-1',
          id: 'item-1',
          input: { messages: [] },
          expectedOutput: null,
          scheduledTriggerInvocationId: 'inv-1',
          scheduledTriggerId: 'trig-1',
        },
        {
          agentId: 'agent-1',
          id: 'item-2',
          input: { messages: [] },
          expectedOutput: null,
          scheduledTriggerInvocationId: 'inv-2',
          scheduledTriggerId: 'trig-1',
        },
      ],
    });

    expect(result).toEqual({ queued: 1, failed: 1 });
  });

  it('marks failed invocations when trigger IDs are present', async () => {
    mockStart.mockRejectedValueOnce(new Error('fail'));

    await queueDatasetRunItems({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      datasetRunId: 'run-1',
      items: [
        {
          agentId: 'agent-1',
          id: 'item-1',
          input: { messages: [] },
          expectedOutput: null,
          scheduledTriggerInvocationId: 'inv-1',
          scheduledTriggerId: 'trig-1',
        },
      ],
    });

    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
  });

  it('skips markFailed when trigger IDs are missing', async () => {
    mockStart.mockRejectedValueOnce(new Error('fail'));

    await queueDatasetRunItems({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      datasetRunId: 'run-1',
      items: [
        {
          agentId: 'agent-1',
          id: 'item-1',
          input: { messages: [] },
          expectedOutput: null,
          scheduledTriggerInvocationId: 'inv-1',
        },
      ],
    });

    expect(mockMarkFailed).not.toHaveBeenCalled();
  });
});
