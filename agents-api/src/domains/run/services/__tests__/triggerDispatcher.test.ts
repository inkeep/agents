import type { DueScheduledTrigger } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual<typeof import('@inkeep/agents-core')>('@inkeep/agents-core');
  return {
    ...actual,
    listAllProjectsMetadata: vi.fn(),
    findDueScheduledTriggersAcrossProjects: vi.fn(),
    advanceScheduledTriggerNextRunAt: vi.fn(),
    getProjectMainResolvedRef: vi.fn(),
    withRef: vi.fn(),
  };
});

vi.mock('src/data/db', () => ({
  manageDbClient: 'mock-manage-client',
  manageDbPool: 'mock-manage-pool',
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

vi.mock('../workflow/functions/scheduledTriggerRunner', () => ({
  scheduledTriggerRunnerWorkflow: 'mock-workflow',
}));

import {
  advanceScheduledTriggerNextRunAt,
  findDueScheduledTriggersAcrossProjects,
  getProjectMainResolvedRef,
  listAllProjectsMetadata,
  withRef,
} from '@inkeep/agents-core';
import { start } from 'workflow/api';
import { dispatchDueTriggers } from '../triggerDispatcher';

const mockListAllProjects = listAllProjectsMetadata as ReturnType<typeof vi.fn>;
const mockFindDueTriggers = findDueScheduledTriggersAcrossProjects as ReturnType<typeof vi.fn>;
const mockAdvanceNextRunAt = advanceScheduledTriggerNextRunAt as ReturnType<typeof vi.fn>;
const mockGetResolvedRef = getProjectMainResolvedRef as ReturnType<typeof vi.fn>;
const mockWithRef = withRef as ReturnType<typeof vi.fn>;
const mockStart = start as ReturnType<typeof vi.fn>;

function makeTrigger(overrides: Partial<DueScheduledTrigger> = {}): DueScheduledTrigger {
  return {
    id: 'trigger-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    agentId: 'agent-1',
    cronExpression: '* * * * *',
    cronTimezone: 'UTC',
    runAt: null,
    nextRunAt: '2026-03-13T10:00:00.000Z',
    enabled: true,
    ...overrides,
  };
}

describe('dispatchDueTriggers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListAllProjects.mockReturnValue(() => Promise.resolve([]));
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([]));
    mockAdvanceNextRunAt.mockReturnValue(() => Promise.resolve());
    mockGetResolvedRef.mockReturnValue(() => Promise.resolve({ branchName: 'main', ref: 'main' }));
    mockWithRef.mockImplementation(async (_pool, _ref, fn, _opts) => {
      return fn('mock-branch-db');
    });
    mockStart.mockResolvedValue(undefined);
  });

  it('returns zero when no projects exist', async () => {
    mockListAllProjects.mockReturnValue(() => Promise.resolve([]));

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 0 });
    expect(mockFindDueTriggers).not.toHaveBeenCalled();
  });

  it('returns zero when no triggers are due', async () => {
    mockListAllProjects.mockReturnValue(() =>
      Promise.resolve([{ id: 'project-1', tenantId: 'tenant-1' }])
    );
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([]));

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 0 });
  });

  it('dispatches all due triggers across projects', async () => {
    const triggers = [
      makeTrigger({ id: 'trigger-1', projectId: 'project-1' }),
      makeTrigger({ id: 'trigger-2', projectId: 'project-2' }),
    ];

    mockListAllProjects.mockReturnValue(() =>
      Promise.resolve([
        { id: 'project-1', tenantId: 'tenant-1' },
        { id: 'project-2', tenantId: 'tenant-1' },
      ])
    );
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve(triggers));

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 2 });
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it('continues dispatching after individual trigger failures', async () => {
    const triggers = [
      makeTrigger({ id: 'trigger-ok' }),
      makeTrigger({ id: 'trigger-fail' }),
      makeTrigger({ id: 'trigger-ok-2' }),
    ];

    mockListAllProjects.mockReturnValue(() =>
      Promise.resolve([{ id: 'project-1', tenantId: 'tenant-1' }])
    );
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

    mockListAllProjects.mockReturnValue(() =>
      Promise.resolve([{ id: 'project-1', tenantId: 'tenant-1' }])
    );
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));

    mockStart.mockImplementation(async () => {
      callOrder.push('start');
    });
    mockWithRef.mockImplementation(async (_pool, _ref, fn, _opts) => {
      callOrder.push('advance');
      return fn('mock-branch-db');
    });

    await dispatchDueTriggers();

    expect(callOrder).toEqual(['start', 'advance']);
  });

  it('disables one-time triggers and sets nextRunAt to null', async () => {
    const trigger = makeTrigger({
      cronExpression: null,
      runAt: '2026-03-13T10:00:00.000Z',
      nextRunAt: '2026-03-13T10:00:00.000Z',
    });

    mockListAllProjects.mockReturnValue(() =>
      Promise.resolve([{ id: 'project-1', tenantId: 'tenant-1' }])
    );
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));

    let capturedAdvanceArgs: Record<string, unknown> | undefined;
    mockAdvanceNextRunAt.mockReturnValue((args: Record<string, unknown>) => {
      capturedAdvanceArgs = args;
      return Promise.resolve();
    });
    mockWithRef.mockImplementation(async (_pool, _ref, fn, _opts) => {
      return fn('mock-branch-db');
    });

    await dispatchDueTriggers();

    expect(capturedAdvanceArgs).toMatchObject({
      nextRunAt: null,
      enabled: false,
    });
  });

  it('computes next cron occurrence for recurring triggers', async () => {
    const trigger = makeTrigger({
      cronExpression: '* * * * *',
      nextRunAt: '2026-03-13T10:00:00.000Z',
    });

    mockListAllProjects.mockReturnValue(() =>
      Promise.resolve([{ id: 'project-1', tenantId: 'tenant-1' }])
    );
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));

    let capturedAdvanceArgs: Record<string, unknown> | undefined;
    mockAdvanceNextRunAt.mockReturnValue((args: Record<string, unknown>) => {
      capturedAdvanceArgs = args;
      return Promise.resolve();
    });
    mockWithRef.mockImplementation(async (_pool, _ref, fn, _opts) => {
      return fn('mock-branch-db');
    });

    await dispatchDueTriggers();

    expect(capturedAdvanceArgs).toBeDefined();
    expect(capturedAdvanceArgs!.nextRunAt).toBe('2026-03-13T10:01:00.000Z');
    expect(capturedAdvanceArgs!.enabled).toBeUndefined();
  });

  it('does not advance nextRunAt when workflow start fails', async () => {
    const trigger = makeTrigger();

    mockListAllProjects.mockReturnValue(() =>
      Promise.resolve([{ id: 'project-1', tenantId: 'tenant-1' }])
    );
    mockFindDueTriggers.mockReturnValue(() => Promise.resolve([trigger]));
    mockStart.mockRejectedValue(new Error('workflow start failed'));

    const result = await dispatchDueTriggers();

    expect(result).toEqual({ dispatched: 0 });
    expect(mockWithRef).not.toHaveBeenCalled();
  });
});
