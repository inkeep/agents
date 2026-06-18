import { describe, expect, it, vi } from 'vitest';
import { queueDatasetRunItems } from '../../../domains/evals/services/datasetRun';

const { startMock, markRunningMock, markFailedMock } = vi.hoisted(() => ({
  startMock: vi.fn(),
  markRunningMock: vi.fn(),
  markFailedMock: vi.fn(),
}));

vi.mock('workflow/api', () => ({
  start: startMock,
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    markScheduledTriggerInvocationRunning: () => markRunningMock,
    markScheduledTriggerInvocationFailed: () => markFailedMock,
  };
});

vi.mock('../../../data/db/runDbClient', () => ({ default: {} }));

describe('queueDatasetRunItems', () => {
  it('counts queued and failed items', async () => {
    markRunningMock.mockResolvedValue(null);
    markFailedMock.mockResolvedValue(null);
    startMock
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);

    const result = await queueDatasetRunItems({
      tenantId: 't1',
      projectId: 'p1',
      datasetRunId: 'dr1',
      items: [
        {
          agentId: 'a1',
          id: 'i1',
          input: { messages: [] },
          scheduledTriggerInvocationId: 'inv1',
        },
        {
          agentId: 'a1',
          id: 'i2',
          input: { messages: [] },
          scheduledTriggerInvocationId: 'inv2',
        },
        {
          agentId: 'a2',
          id: 'i3',
          input: { messages: [] },
          scheduledTriggerInvocationId: 'inv3',
        },
      ],
      evaluatorIds: ['e1'],
      evaluationRunId: 'er1',
    });

    expect(result).toEqual({ queued: 2, failed: 1 });
    expect(startMock).toHaveBeenCalledTimes(3);
    expect(startMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ datasetItemId: 'i1', delayBeforeExecutionMs: 0 }),
      ])
    );
    expect(startMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ datasetItemId: 'i2', delayBeforeExecutionMs: 120_000 }),
      ])
    );
    expect(startMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ datasetItemId: 'i3', delayBeforeExecutionMs: 240_000 }),
      ])
    );
  });

  it('routes each item to its own scheduledTriggerId', async () => {
    markRunningMock.mockResolvedValue(null);
    markFailedMock.mockResolvedValue(null);
    startMock.mockReset().mockResolvedValue(undefined);

    await queueDatasetRunItems({
      tenantId: 't1',
      projectId: 'p1',
      datasetRunId: 'dr1',
      items: [
        {
          agentId: 'a1',
          id: 'i1',
          input: { messages: [] },
          scheduledTriggerInvocationId: 'inv1',
          scheduledTriggerId: 'trigger-a1',
        },
        {
          agentId: 'a2',
          id: 'i2',
          input: { messages: [] },
          scheduledTriggerInvocationId: 'inv2',
        },
      ],
    });

    expect(startMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ triggerId: 'trigger-a1' })])
    );
    expect(startMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ triggerId: undefined })])
    );
  });
});
