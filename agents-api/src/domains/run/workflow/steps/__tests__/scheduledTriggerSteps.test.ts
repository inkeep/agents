import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    advanceScheduledTriggerNextRunAt: vi.fn(),
    canUseProjectStrict: vi.fn(),
    createScheduledTriggerInvocation: vi.fn(),
    generateId: vi.fn(() => 'generated-id'),
    getScheduledTriggerById: vi.fn(),
    getScheduledTriggerInvocationByIdempotencyKey: vi.fn(),
    markScheduledTriggerInvocationCompleted: vi.fn(),
    markScheduledTriggerInvocationFailed: vi.fn(),
    resolveRef: vi.fn(),
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
    with: vi.fn().mockReturnThis(),
  }),
  runWithLogContext: vi.fn((_bindings: any, fn: any) => fn()),
}));

vi.mock('../../../services/TriggerService', () => ({
  buildTimezoneHeaders: vi.fn(() => ({})),
  executeAgentAsync: vi.fn(),
}));

import {
  advanceScheduledTriggerNextRunAt,
  canUseProjectStrict,
  createScheduledTriggerInvocation,
  generateId,
  getScheduledTriggerById,
  getScheduledTriggerInvocationByIdempotencyKey,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  resolveRef,
} from '@inkeep/agents-core';
import { executeAgentAsync } from '../../../services/TriggerService';
import {
  checkTriggerEnabledStep,
  createInvocationIdempotentStep,
  disableOneTimeTriggerStep,
  executeScheduledTriggerStep,
  markCompletedStep,
  markFailedStep,
} from '../scheduledTriggerSteps';

const mockGetTriggerById = getScheduledTriggerById as ReturnType<typeof vi.fn>;
const mockAdvanceNextRunAt = advanceScheduledTriggerNextRunAt as ReturnType<typeof vi.fn>;
const mockMarkCompleted = markScheduledTriggerInvocationCompleted as ReturnType<typeof vi.fn>;
const mockMarkFailed = markScheduledTriggerInvocationFailed as ReturnType<typeof vi.fn>;
const mockGetInvocationByKey = getScheduledTriggerInvocationByIdempotencyKey as ReturnType<
  typeof vi.fn
>;
const mockResolveRef = resolveRef as ReturnType<typeof vi.fn>;
const mockGenerateId = generateId as ReturnType<typeof vi.fn>;
const mockCreateInvocation = createScheduledTriggerInvocation as ReturnType<typeof vi.fn>;
const mockCanUseProjectStrict = canUseProjectStrict as ReturnType<typeof vi.fn>;
const mockExecuteAgentAsync = executeAgentAsync as ReturnType<typeof vi.fn>;

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
      mockGetTriggerById.mockReturnValue(() => Promise.resolve({ enabled: true, id: 'trigger-1' }));
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

  describe('createInvocationIdempotentStep', () => {
    const invocationParams = {
      ...baseParams,
      scheduledFor: '2026-03-13T10:00:00.000Z',
      payload: { key: 'value' },
      idempotencyKey: 'sched_trigger-1_2026-03-13T10:00:00.000Z',
      ref: 'main',
    };

    it('returns alreadyExists: true when invocation exists for idempotency key', async () => {
      const existing = { id: 'inv-existing', status: 'completed' };
      mockGetInvocationByKey.mockReturnValue(() => Promise.resolve(existing));

      const result = await createInvocationIdempotentStep(invocationParams);

      expect(result.alreadyExists).toBe(true);
      expect(result.invocation).toEqual(existing);
      expect(mockCreateInvocation).not.toHaveBeenCalled();
    });

    it('creates a new invocation with resolved ref', async () => {
      mockGetInvocationByKey.mockReturnValue(() => Promise.resolve(null));
      mockResolveRef.mockReturnValue(() => Promise.resolve('resolved-ref-hash'));
      mockGenerateId.mockReturnValue('new-inv-id');
      const createdInvocation = { id: 'new-inv-id', status: 'pending' };
      mockCreateInvocation.mockReturnValue(() => Promise.resolve(createdInvocation));

      const result = await createInvocationIdempotentStep(invocationParams);

      expect(result.alreadyExists).toBe(false);
      expect(result.invocation).toEqual(createdInvocation);
      expect(mockCreateInvocation).toHaveBeenCalledWith('mock-run-client');
    });

    it('passes the trigger ref through to getProjectScopedRef', async () => {
      mockGetInvocationByKey.mockReturnValue(() => Promise.resolve(null));
      const mockResolve = vi.fn().mockResolvedValue('resolved-feature-ref');
      mockResolveRef.mockReturnValue(mockResolve);
      mockGenerateId.mockReturnValue('new-inv-id');
      mockCreateInvocation.mockReturnValue(() =>
        Promise.resolve({ id: 'new-inv-id', status: 'pending' })
      );

      await createInvocationIdempotentStep({
        ...invocationParams,
        ref: 'feat/my-branch',
      });

      expect(mockResolveRef).toHaveBeenCalledWith('mock-manage-client');
      expect(mockResolve).toHaveBeenCalledWith('tenant-1_project-1_feat/my-branch');
    });

    it('creates invocation without ref when resolution fails', async () => {
      mockGetInvocationByKey.mockReturnValue(() => Promise.resolve(null));
      mockResolveRef.mockReturnValue(() => Promise.resolve(null));
      mockGenerateId.mockReturnValue('new-inv-id');
      const mockCreate = vi.fn().mockResolvedValue({ id: 'new-inv-id', status: 'pending' });
      mockCreateInvocation.mockReturnValue(mockCreate);

      const result = await createInvocationIdempotentStep(invocationParams);

      expect(result.alreadyExists).toBe(false);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          ref: undefined,
        })
      );
    });
  });

  describe('executeScheduledTriggerStep', () => {
    const execParams = {
      ...baseParams,
      invocationId: 'inv-1',
      timeoutSeconds: 30,
      ref: 'main',
    };

    beforeEach(() => {
      mockGenerateId.mockReturnValue('conv-123');
      mockResolveRef.mockReturnValue(() => Promise.resolve('resolved-ref'));
      mockExecuteAgentAsync.mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns failure when runAsUserId lacks project access', async () => {
      mockCanUseProjectStrict.mockResolvedValue(false);

      const result = await executeScheduledTriggerStep({
        ...execParams,
        runAsUserId: 'user-no-access',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('no longer has');
      expect(result.error).toContain('user-no-access');
      expect(mockExecuteAgentAsync).not.toHaveBeenCalled();
    });

    it('returns failure when canUseProjectStrict throws', async () => {
      mockCanUseProjectStrict.mockRejectedValue(new Error('SpiceDB unavailable'));

      const result = await executeScheduledTriggerStep({
        ...execParams,
        runAsUserId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission check failed');
      expect(result.error).toContain('SpiceDB unavailable');
    });

    it('returns failure when ref resolution returns null', async () => {
      mockResolveRef.mockReturnValue(() => Promise.resolve(null));

      const result = await executeScheduledTriggerStep(execParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to resolve ref 'main'");
      expect(result.conversationId).toBe('conv-123');
    });

    it('times out after configured seconds', async () => {
      vi.useFakeTimers();
      mockExecuteAgentAsync.mockImplementation(() => new Promise(() => {}));

      const resultPromise = executeScheduledTriggerStep({
        ...execParams,
        timeoutSeconds: 5,
      });

      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out after 5s');
      expect(result.conversationId).toBe('conv-123');
    });

    it('interpolates message template with payload variables', async () => {
      mockCanUseProjectStrict.mockResolvedValue(true);

      const result = await executeScheduledTriggerStep({
        ...execParams,
        messageTemplate: 'Hello {{name}}, report for {{date}}',
        payload: { name: 'Alice', date: '2026-03-13' },
        runAsUserId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(mockExecuteAgentAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: 'Hello Alice, report for 2026-03-13',
        })
      );
    });

    it('uses JSON-serialized payload when no template is provided', async () => {
      const result = await executeScheduledTriggerStep({
        ...execParams,
        payload: { status: 'ready' },
      });

      expect(result.success).toBe(true);
      expect(mockExecuteAgentAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: JSON.stringify({ status: 'ready' }),
        })
      );
    });

    it('skips permission check when runAsUserId is not set', async () => {
      const result = await executeScheduledTriggerStep(execParams);

      expect(result.success).toBe(true);
      expect(mockCanUseProjectStrict).not.toHaveBeenCalled();
    });

    it('passes resolved ref and conversation ID to executeAgentAsync', async () => {
      await executeScheduledTriggerStep(execParams);

      expect(mockExecuteAgentAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedRef: 'resolved-ref',
          conversationId: 'conv-123',
          tenantId: 'tenant-1',
          projectId: 'project-1',
          agentId: 'agent-1',
          invocationType: 'scheduled_trigger',
        })
      );
    });
  });
});
