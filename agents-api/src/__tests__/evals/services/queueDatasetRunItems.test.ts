import { describe, expect, it, vi } from 'vitest';
import { queueDatasetRunItems } from '../../../domains/evals/services/datasetRun';

const { startMock } = vi.hoisted(() => ({
  startMock: vi.fn(),
}));

vi.mock('workflow/api', () => ({
  start: startMock,
}));

describe('queueDatasetRunItems', () => {
  it('counts queued and failed items', async () => {
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
        { agentId: 'a1', id: 'i1', input: { messages: [] } },
        { agentId: 'a1', id: 'i2', input: { messages: [] } },
        { agentId: 'a2', id: 'i3', input: { messages: [] } },
      ],
      evaluatorIds: ['e1'],
      evaluationRunId: 'er1',
    });

    expect(result).toEqual({ queued: 2, failed: 1 });
    expect(startMock).toHaveBeenCalledTimes(3);
    expect(startMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ datasetItemId: 'i1' })])
    );
  });
});
