import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    advanceScheduledTriggerNextRunAt: vi.fn(),
    getScheduledTriggerById: vi.fn(),
    markScheduledTriggerInvocationCompleted: vi.fn(),
    markScheduledTriggerInvocationFailed: vi.fn(),
  };
});

vi.mock('../../../../../data/db', () => ({
  manageDbClient: 'mock-manage-client',
}));

vi.mock('../../../../../data/db/runDbClient', () => ({
  default: 'mock-run-client',
}));

vi.mock('../../../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../services/TriggerService', () => ({
  buildTimezoneHeaders: vi.fn(),
  executeAgentAsync: vi.fn(),
}));

import {
  advanceScheduledTriggerNextRunAt,
  getScheduledTriggerById,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
} from '@inkeep/agents-core';
import {
  checkTriggerEnabledStep,
  disableOneTimeTriggerStep,
  markCompletedStep,
  markFailedStep,
} from '../scheduledTriggerSteps';

const mockGetTriggerById = getScheduledTriggerById as ReturnType<typeof vi.fn>;
const mockAdvanceNextRunAt = advanceScheduledTriggerNextRunAt as ReturnType<typeof vi.fn>;
const mockMarkCompleted = markScheduledTriggerInvocationCompleted as ReturnType<typeof vi.fn>;
const mockMarkFailed = markScheduledTriggerInvocationFailed as ReturnType<typeof vi.fn>;

const baseParams = {
  tenantId: 'tenant-1',
  projectId: 'project-1',
  agentId: 'agent-1',
  scheduledTriggerId: 'trigger-1',
};

describe('scheduledTriggerSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkTriggerEnabledStep', () => {
    it('returns shouldContinue: true when trigger is enabled', async () => {
      const trigger = { enabled: true, id: 'trigger-1' };
      mockGetTriggerById.mockReturnValue(() => Promise.resolve(trigger));

      const result = await checkTriggerEnabledStep({
        ...baseParams,
        runnerId: 'runner-1',
      });

      expect(result.shouldContinue).toBe(true);
      expect(result.trigger).toEqual(trigger);
    });

    it('returns shouldContinue: false with reason "disabled" when trigger is disabled', async () => {
      mockGetTriggerById.mockReturnValue(() =>
        Promise.resolve({ enabled: false, id: 'trigger-1' })
      );

      const result = await checkTriggerEnabledStep({
        ...baseParams,
        runnerId: 'runner-1',
      });

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('disabled');
      expect(result.trigger).toBeNull();
    });

    it('returns shouldContinue: false with reason "deleted" when trigger not found', async () => {
      mockGetTriggerById.mockReturnValue(() => Promise.resolve(null));

      const result = await checkTriggerEnabledStep({
        ...baseParams,
        runnerId: 'runner-1',
      });

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('deleted');
      expect(result.trigger).toBeNull();
    });
  });

  describe('disableOneTimeTriggerStep', () => {
    it('calls advanceScheduledTriggerNextRunAt with enabled: false and nextRunAt: null', async () => {
      const mockAdvance = vi.fn().mockResolvedValue(undefined);
      mockAdvanceNextRunAt.mockReturnValue(mockAdvance);

      await disableOneTimeTriggerStep(baseParams);

      expect(mockAdvanceNextRunAt).toHaveBeenCalledWith('mock-run-client');
      expect(mockAdvance).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
        },
        scheduledTriggerId: 'trigger-1',
        nextRunAt: null,
        enabled: false,
      });
    });
  });

  describe('markCompletedStep', () => {
    it('marks invocation as completed', async () => {
      const mockMark = vi.fn().mockResolvedValue(undefined);
      mockMarkCompleted.mockReturnValue(mockMark);

      await markCompletedStep({
        ...baseParams,
        invocationId: 'inv-1',
      });

      expect(mockMarkCompleted).toHaveBeenCalledWith('mock-run-client');
      expect(mockMark).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
        },
        scheduledTriggerId: 'trigger-1',
        invocationId: 'inv-1',
      });
    });
  });

  describe('markFailedStep', () => {
    it('marks invocation as failed', async () => {
      const mockMark = vi.fn().mockResolvedValue(undefined);
      mockMarkFailed.mockReturnValue(mockMark);

      await markFailedStep({
        ...baseParams,
        invocationId: 'inv-1',
      });

      expect(mockMarkFailed).toHaveBeenCalledWith('mock-run-client');
      expect(mockMark).toHaveBeenCalledWith({
        scopes: {
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
        },
        scheduledTriggerId: 'trigger-1',
        invocationId: 'inv-1',
      });
    });
  });
});
