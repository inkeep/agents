import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('workflow', () => ({
  sleep: vi.fn(),
}));

vi.mock('../../../../logger', () => createMockLoggerModule().module);

vi.mock('../../../run/workflow/steps/scheduledTriggerSteps', () => ({
  logStep: vi.fn(),
}));

vi.mock('../steps/scheduledDatasetRunSteps', () => ({
  checkDatasetRunTriggerEnabledStep: vi.fn(),
  disableDatasetRunTriggerStep: vi.fn(),
  executeDatasetRunStep: vi.fn(),
}));

import { sleep } from 'workflow';
import {
  checkDatasetRunTriggerEnabledStep,
  disableDatasetRunTriggerStep,
  executeDatasetRunStep,
} from '../steps/scheduledDatasetRunSteps';

const _scheduledDatasetRunWorkflow = (await import('../functions/scheduledDatasetRun'))
  .scheduledDatasetRunWorkflow;

const mockCheckEnabled = checkDatasetRunTriggerEnabledStep as ReturnType<typeof vi.fn>;
const mockDisable = disableDatasetRunTriggerStep as ReturnType<typeof vi.fn>;
const mockExecuteStep = executeDatasetRunStep as ReturnType<typeof vi.fn>;
const mockSleep = sleep as ReturnType<typeof vi.fn>;

const basePayload = {
  tenantId: 'tenant-1',
  projectId: 'project-1',
  datasetRunConfigId: 'config-1',
  scheduledTriggerId: 'trigger-1',
  scheduledFor: '2026-06-17T10:00:00.000Z',
  ref: 'main',
};

function makeTrigger(overrides: Record<string, unknown> = {}) {
  return {
    cronExpression: '0 * * * *',
    maxRetries: 2,
    retryDelaySeconds: 10,
    dispatchDelayMs: null,
    runAsUserId: 'user-1',
    payload: { datasetRunConfigId: 'config-1', evaluatorIds: ['eval-1'] },
    ...overrides,
  };
}

describe('scheduledDatasetRunWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSleep.mockResolvedValue(undefined);
    mockDisable.mockResolvedValue(undefined);
  });

  it('returns stopped when trigger is disabled', async () => {
    mockCheckEnabled.mockResolvedValue({
      shouldContinue: false,
      reason: 'Trigger is disabled',
      trigger: null,
    });

    const result = await _scheduledDatasetRunWorkflow(basePayload);

    expect(result).toEqual({ status: 'stopped', reason: 'Trigger is disabled' });
    expect(mockExecuteStep).not.toHaveBeenCalled();
  });

  describe('retry loop', () => {
    it('succeeds on first attempt with cron trigger', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger(),
      });
      mockExecuteStep.mockResolvedValue({
        success: true,
        datasetRunId: 'run-1',
      });

      const result = await _scheduledDatasetRunWorkflow(basePayload);

      expect(result).toEqual({ status: 'completed', datasetRunId: 'run-1' });
      expect(mockExecuteStep).toHaveBeenCalledTimes(1);
      expect(mockDisable).not.toHaveBeenCalled();
    });

    it('retries up to maxRetries + 1 times then fails', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger({ maxRetries: 2 }),
      });
      mockExecuteStep.mockResolvedValue({
        success: false,
        error: 'DB down',
      });

      const result = await _scheduledDatasetRunWorkflow(basePayload);

      expect(result).toEqual({ status: 'failed', error: 'DB down' });
      expect(mockExecuteStep).toHaveBeenCalledTimes(3);
      expect(mockSleep).toHaveBeenCalledTimes(2);
    });

    it('succeeds on second attempt after first failure', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger({ maxRetries: 2 }),
      });
      mockExecuteStep
        .mockResolvedValueOnce({ success: false, error: 'transient' })
        .mockResolvedValueOnce({ success: true, datasetRunId: 'run-2' });

      const result = await _scheduledDatasetRunWorkflow(basePayload);

      expect(result).toEqual({ status: 'completed', datasetRunId: 'run-2' });
      expect(mockExecuteStep).toHaveBeenCalledTimes(2);
    });

    it('applies exponential backoff with jitter between retries', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger({ maxRetries: 1, retryDelaySeconds: 10 }),
      });
      mockExecuteStep.mockResolvedValue({ success: false, error: 'fail' });

      await _scheduledDatasetRunWorkflow(basePayload);

      expect(mockSleep).toHaveBeenCalledTimes(1);
      const sleepMs = mockSleep.mock.calls[0][0] as number;
      expect(sleepMs).toBeGreaterThanOrEqual(10 * 1000 * 2);
      expect(sleepMs).toBeLessThanOrEqual(10 * 1000 * 2 * 1.3);
    });
  });

  describe('one-time trigger cleanup', () => {
    it('disables one-time trigger on success', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger({ cronExpression: null }),
      });
      mockExecuteStep.mockResolvedValue({
        success: true,
        datasetRunId: 'run-1',
      });

      const result = await _scheduledDatasetRunWorkflow(basePayload);

      expect(result.status).toBe('completed');
      expect(mockDisable).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        scheduledTriggerId: 'trigger-1',
      });
    });

    it('disables one-time trigger on exhausted retries', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger({ cronExpression: null, maxRetries: 0 }),
      });
      mockExecuteStep.mockResolvedValue({ success: false, error: 'fail' });

      const result = await _scheduledDatasetRunWorkflow(basePayload);

      expect(result.status).toBe('failed');
      expect(mockDisable).toHaveBeenCalledTimes(1);
    });

    it('does not disable cron trigger on failure', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger({ cronExpression: '0 * * * *', maxRetries: 0 }),
      });
      mockExecuteStep.mockResolvedValue({ success: false, error: 'fail' });

      const result = await _scheduledDatasetRunWorkflow(basePayload);

      expect(result.status).toBe('failed');
      expect(mockDisable).not.toHaveBeenCalled();
    });

    it('disables cron trigger immediately on configMisconfigured', async () => {
      mockCheckEnabled.mockResolvedValue({
        shouldContinue: true,
        trigger: makeTrigger({ cronExpression: '0 * * * *', maxRetries: 3 }),
      });
      mockExecuteStep.mockResolvedValue({
        success: false,
        configMisconfigured: true,
        error: 'No agents configured',
      });

      const result = await _scheduledDatasetRunWorkflow(basePayload);

      expect(result.status).toBe('stopped');
      expect(result.reason).toContain('No agents configured');
      expect(mockDisable).toHaveBeenCalledTimes(1);
      expect(mockExecuteStep).toHaveBeenCalledTimes(1);
    });
  });

  it('sleeps for delayBeforeExecutionMs before running', async () => {
    mockCheckEnabled.mockResolvedValue({
      shouldContinue: true,
      trigger: makeTrigger(),
    });
    mockExecuteStep.mockResolvedValue({ success: true, datasetRunId: 'run-1' });

    await _scheduledDatasetRunWorkflow({
      ...basePayload,
      delayBeforeExecutionMs: 5000,
    });

    expect(mockSleep).toHaveBeenCalledWith(5000);
  });
});
