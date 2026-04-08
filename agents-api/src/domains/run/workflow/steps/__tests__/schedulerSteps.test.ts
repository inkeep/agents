import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    getSchedulerState: vi.fn(),
    upsertSchedulerState: vi.fn(),
  };
});

vi.mock('../../../../../data/db/runDbClient', () => ({
  default: 'mock-run-client',
}));

vi.mock('../../../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    with: vi.fn().mockReturnThis(),
  }),
  runWithLogContext: vi.fn((_bindings: any, fn: any) => fn()),
}));

vi.mock('../../../services/triggerDispatcher', () => ({
  dispatchDueTriggers: vi.fn(),
}));

import { getSchedulerState, upsertSchedulerState } from '@inkeep/agents-core';
import { dispatchDueTriggers } from '../../../services/triggerDispatcher';
import {
  checkSchedulerCurrentStep,
  dispatchDueTriggersStep,
  msUntilNextMinuteStep,
  registerSchedulerStep,
} from '../schedulerSteps';

const mockUpsertSchedulerState = upsertSchedulerState as ReturnType<typeof vi.fn>;
const mockGetSchedulerState = getSchedulerState as ReturnType<typeof vi.fn>;
const mockDispatchDueTriggers = dispatchDueTriggers as ReturnType<typeof vi.fn>;

describe('schedulerSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerSchedulerStep', () => {
    it('upserts scheduler state with the given run ID', async () => {
      const mockUpsert = vi.fn().mockResolvedValue(undefined);
      mockUpsertSchedulerState.mockReturnValue(mockUpsert);

      await registerSchedulerStep({ runId: 'run-abc' });

      expect(mockUpsertSchedulerState).toHaveBeenCalledWith('mock-run-client');
      expect(mockUpsert).toHaveBeenCalledWith({ currentRunId: 'run-abc' });
    });
  });

  describe('checkSchedulerCurrentStep', () => {
    it('returns true when run ID matches current state', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve({ currentRunId: 'run-abc' }));

      const result = await checkSchedulerCurrentStep({ runId: 'run-abc' });

      expect(result).toBe(true);
    });

    it('returns false when run ID does not match', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve({ currentRunId: 'run-xyz' }));

      const result = await checkSchedulerCurrentStep({ runId: 'run-abc' });

      expect(result).toBe(false);
    });

    it('returns false when no scheduler state exists', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve(null));

      const result = await checkSchedulerCurrentStep({ runId: 'run-abc' });

      expect(result).toBe(false);
    });

    it('returns false when state has no currentRunId', async () => {
      mockGetSchedulerState.mockReturnValue(() => Promise.resolve({ currentRunId: null }));

      const result = await checkSchedulerCurrentStep({ runId: 'run-abc' });

      expect(result).toBe(false);
    });
  });

  describe('msUntilNextMinuteStep', () => {
    it('returns milliseconds until next minute boundary', async () => {
      const ms = await msUntilNextMinuteStep();

      expect(ms).toBeGreaterThanOrEqual(1_000);
      expect(ms).toBeLessThanOrEqual(60_000);
    });

    it('returns at least 1000ms', async () => {
      const ms = await msUntilNextMinuteStep();

      expect(ms).toBeGreaterThanOrEqual(1_000);
    });
  });

  describe('dispatchDueTriggersStep', () => {
    it('calls dispatchDueTriggers', async () => {
      mockDispatchDueTriggers.mockResolvedValue({ dispatched: 0 });

      await dispatchDueTriggersStep();

      expect(mockDispatchDueTriggers).toHaveBeenCalledOnce();
    });

    it('does not throw when dispatched count is positive', async () => {
      mockDispatchDueTriggers.mockResolvedValue({ dispatched: 5 });

      await expect(dispatchDueTriggersStep()).resolves.not.toThrow();
    });
  });
});
