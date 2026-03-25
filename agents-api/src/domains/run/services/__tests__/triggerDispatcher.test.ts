import type { ScheduledTrigger } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    findDueScheduledTriggersAcrossProjects: vi.fn(),
    advanceScheduledTriggerNextRunAt: vi.fn(),
  };
});

vi.mock('src/data/db', () => ({
  runDbClient: 'mock-run-client',
}));

vi.mock('workflow/api', () => ({
  start: vi.fn(),
}));

vi.mock('../../../../logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../workflow/functions/scheduledTriggerRunner', () => ({
  scheduledTriggerRunnerWorkflow: { workflowId: 'mock-workflow' },
}));

import {
  advanceScheduledTriggerNextRunAt,
  findDueScheduledTriggersAcrossProjects,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import { dispatchDueTriggers } from '../triggerDispatcher';

const mockFindDueTriggers = findDueScheduledTriggersAcrossProjects as ReturnType<typeof vi.fn>;
const mockAdvanceNextRunAt = advanceScheduledTriggerNextRunAt as ReturnType<typeof vi.fn>;
const mockStart = start as ReturnType<typeof vi.fn>;

function makeTrigger(overrides: Partial<ScheduledTrigger> = {}): ScheduledTrigger {
  return {
    id: 'trigger-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    agentId: 'agent-1',
    name: 'test-trigger',
    description: null,
    cronExpression: '* * * * *',
    cronTimezone: 'UTC',
    runAt: null,
    payload: null,
    messageTemplate: null,
    maxRetries: 1,
    retryDelaySeconds: 60,
    timeoutSeconds: 780,
    runAsUserId: null,
    createdBy: null,
    nextRunAt: '2026-03-13T10:00:00.000Z',
    enabled: true,
    ref: 'main',
    createdAt: '2026-03-13T00:00:00.000Z',
    updatedAt: '2026-03-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('dispatchDueTriggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([]));
    mockAdvanceNextRunAt.mockReturnValue(() => Promise.resolve());
    mockStart.mockResolvedValue(undefined);
  });

  it('returns zero when no triggers are due', async () => {
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([]));

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 0 });
  });

  it('dispatches all due triggers across projects', async () => {
    const triggers = [
      makeTrigger({ id: 'trigger-1', projectId: 'project-1' }),
      makeTrigger({ id: 'trigger-2', projectId: 'project-2' }),
    ];

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve(triggers));

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 2 });
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it('passes ref from trigger into TriggerPayload', async () => {
    const triggers = [makeTrigger({ ref: 'feat/new-prompt' })];

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve(triggers));

    await dispatchDueTriggers();

    expect(mockStart).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ ref: 'feat/new-prompt' }),
    ]);
  });

  it('passes default ref for triggers without explicit ref', async () => {
    const triggers = [makeTrigger({ ref: 'main' })];

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve(triggers));

    await dispatchDueTriggers();

    expect(mockStart).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ ref: 'main' }),
    ]);
  });

  it('continues dispatching after individual trigger failures', async () => {
    const triggers = [
      makeTrigger({ id: 'trigger-ok' }),
      makeTrigger({ id: 'trigger-fail' }),
      makeTrigger({ id: 'trigger-ok-2' }),
    ];

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve(triggers));

    mockStart
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('workflow start failed'))
      .mockResolvedValueOnce(undefined);

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 2 });
    expect(mockStart).toHaveBeenCalledTimes(3);
  });

  it('starts workflow before advancing nextRunAt', async () => {
    const trigger = makeTrigger();
    const callOrder: string[] = [];

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));

    mockStart.mockImplementation(async () => {
      callOrder.push('start');
    });
    mockAdvanceNextRunAt.mockReturnValue(async () => {
      callOrder.push('advance');
    });

    await dispatchDueTriggers();

    expect(callOrder).toEqual(['start', 'advance']);
  });

  it('sets nextRunAt to null for one-time triggers without disabling', async () => {
    const trigger = makeTrigger({
      cronExpression: null,
      runAt: '2026-03-13T10:00:00.000Z',
      nextRunAt: '2026-03-13T10:00:00.000Z',
    });

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));

    let capturedAdvanceArgs: Record<string, unknown> | undefined;
    mockAdvanceNextRunAt.mockReturnValue((args: Record<string, unknown>) => {
      capturedAdvanceArgs = args;
      return Promise.resolve();
    });

    await dispatchDueTriggers();

    expect(capturedAdvanceArgs).toMatchObject({
      nextRunAt: null,
    });
    expect(capturedAdvanceArgs?.enabled).toBeUndefined();
  });

  it('computes next cron occurrence for recurring triggers', async () => {
    const trigger = makeTrigger({
      cronExpression: '* * * * *',
      nextRunAt: '2026-03-13T10:00:00.000Z',
    });

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));

    let capturedAdvanceArgs: Record<string, unknown> | undefined;
    mockAdvanceNextRunAt.mockReturnValue((args: Record<string, unknown>) => {
      capturedAdvanceArgs = args;
      return Promise.resolve();
    });

    await dispatchDueTriggers();

    expect(capturedAdvanceArgs).toBeDefined();
    expect(capturedAdvanceArgs?.nextRunAt).toBe('2026-03-13T10:01:00.000Z');
    expect(capturedAdvanceArgs?.enabled).toBeUndefined();
  });

  it('does not advance nextRunAt when workflow start fails', async () => {
    const trigger = makeTrigger();

    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));
    mockStart.mockRejectedValue(new Error('workflow start failed'));

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 0 });
    expect(mockAdvanceNextRunAt).not.toHaveBeenCalled();
  });
});
