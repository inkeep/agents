import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    getSchedulerState: vi.fn(),
  };
});

vi.mock('workflow/api', () => ({
  start: vi.fn(),
}));

vi.mock('../../../../data/db/runDbClient', () => ({
  default: 'mock-run-client',
}));

vi.mock('../../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../workflow/functions/schedulerWorkflow', () => ({
  schedulerWorkflow: 'mock-scheduler-workflow',
}));

import { getSchedulerState } from '@inkeep/agents-core';
import { start } from 'workflow/api';
import { getSchedulerStatus, startSchedulerWorkflow } from '../SchedulerService';

const mockGetSchedulerState = getSchedulerState as ReturnType<typeof vi.fn>;
const mockStart = start as ReturnType<typeof vi.fn>;

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startSchedulerWorkflow', () => {
    it('starts a new workflow and returns run IDs', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve({ currentRunId: 'old-run-123' }));
      mockStart.mockResolvedValue({ runId: 'new-run-456' });

      const result = await startSchedulerWorkflow();

      expect(result).toEqual({
        runId: 'new-run-456',
        previousRunId: 'old-run-123',
      });
      expect(mockStart).toHaveBeenCalledWith('mock-scheduler-workflow', []);
    });

    it('returns null previousRunId when no prior scheduler exists', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve(null));
      mockStart.mockResolvedValue({ runId: 'first-run' });

      const result = await startSchedulerWorkflow();

      expect(result).toEqual({
        runId: 'first-run',
        previousRunId: null,
      });
    });

    it('returns null previousRunId when state has no currentRunId', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve({ currentRunId: null }));
      mockStart.mockResolvedValue({ runId: 'new-run' });

      const result = await startSchedulerWorkflow();

      expect(result).toEqual({
        runId: 'new-run',
        previousRunId: null,
      });
    });

    it('propagates workflow start errors', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve(null));
      mockStart.mockRejectedValue(new Error('workflow runtime unavailable'));

      await expect(startSchedulerWorkflow()).rejects.toThrow('workflow runtime unavailable');
    });
  });

  describe('getSchedulerStatus', () => {
    it('returns current scheduler state', async () => {
      const state = { currentRunId: 'run-123' };
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve(state));

      const result = await getSchedulerStatus();

      expect(result).toEqual(state);
    });

    it('returns null when no scheduler state exists', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve(null));

      const result = await getSchedulerStatus();

      expect(result).toBeNull();
    });
  });
});
