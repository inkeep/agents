import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { WORKFLOW_TARGET_WORLD: undefined as string | undefined },
  worldStart: vi.fn(async () => {}),
  recoverOrphanedWorkflows: vi.fn(async () => 0),
  startSchedulerWorkflow: vi.fn(async () => {}),
  cleanupStreamChunks: vi.fn(async () => {}),
  cleanupToolApprovals: vi.fn(async () => {}),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../env', () => ({ env: mocks.env }));
vi.mock('../logger', () => ({ getLogger: () => mocks.logger }));
vi.mock('../data/db/runDbClient', () => ({ default: {} }));
vi.mock('../workflow/world', () => ({
  world: { start: mocks.worldStart },
  recoverOrphanedWorkflows: mocks.recoverOrphanedWorkflows,
}));
vi.mock('../domains/run/services/SchedulerService', () => ({
  startSchedulerWorkflow: mocks.startSchedulerWorkflow,
}));
vi.mock('@inkeep/agents-core', () => ({
  cleanupExpiredStreamChunks: () => mocks.cleanupStreamChunks,
  cleanupExpiredToolApprovalDecisions: () => mocks.cleanupToolApprovals,
}));

import {
  resetWorkflowWorldStartupForTests,
  runWorkflowWorldStartup,
  scheduleWorkflowWorldStartup,
} from '../startup/workflow-world';

describe('workflow world startup', () => {
  const originalVercel = process.env.VERCEL;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetWorkflowWorldStartupForTests();
    mocks.env.WORKFLOW_TARGET_WORLD = undefined;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it('starts the postgres worker, then recovers orphans and starts the scheduler', async () => {
    mocks.env.WORKFLOW_TARGET_WORLD = '@workflow/world-postgres';

    await runWorkflowWorldStartup();

    expect(mocks.worldStart).toHaveBeenCalledTimes(1);
    expect(mocks.recoverOrphanedWorkflows).toHaveBeenCalledTimes(1);
    expect(mocks.startSchedulerWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.worldStart.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recoverOrphanedWorkflows.mock.invocationCallOrder[0]
    );
  });

  it('skips world.start() for the local world but still recovers orphans', async () => {
    mocks.env.WORKFLOW_TARGET_WORLD = 'local';

    await runWorkflowWorldStartup();

    expect(mocks.worldStart).not.toHaveBeenCalled();
    expect(mocks.recoverOrphanedWorkflows).toHaveBeenCalledTimes(1);
    expect(mocks.startSchedulerWorkflow).toHaveBeenCalledTimes(1);
  });

  it('logs startup errors instead of throwing', async () => {
    mocks.env.WORKFLOW_TARGET_WORLD = '@workflow/world-postgres';
    mocks.worldStart.mockRejectedValueOnce(new Error('connection refused'));

    await expect(runWorkflowWorldStartup()).resolves.toBeUndefined();

    expect(mocks.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'Failed to start workflow world'
    );
    expect(mocks.recoverOrphanedWorkflows).not.toHaveBeenCalled();
  });

  it('schedules startup after the delay and only once per process', async () => {
    mocks.env.WORKFLOW_TARGET_WORLD = '@workflow/world-postgres';

    scheduleWorkflowWorldStartup({ delayMs: 100 });
    scheduleWorkflowWorldStartup({ delayMs: 100 });

    expect(mocks.worldStart).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    expect(mocks.worldStart).toHaveBeenCalledTimes(1);
    expect(mocks.recoverOrphanedWorkflows).toHaveBeenCalledTimes(1);
    expect(mocks.startSchedulerWorkflow).toHaveBeenCalledTimes(1);
  });

  it('does not start the worker for the vercel world', async () => {
    mocks.env.WORKFLOW_TARGET_WORLD = 'vercel';

    scheduleWorkflowWorldStartup({ delayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);

    expect(mocks.worldStart).not.toHaveBeenCalled();
    expect(mocks.recoverOrphanedWorkflows).not.toHaveBeenCalled();
  });

  it('runs periodic cleanups when not on Vercel', async () => {
    scheduleWorkflowWorldStartup({ delayMs: 100 });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.cleanupStreamChunks).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupToolApprovals).toHaveBeenCalledTimes(1);
  });

  it('skips periodic cleanups on Vercel', async () => {
    process.env.VERCEL = '1';
    mocks.env.WORKFLOW_TARGET_WORLD = 'vercel';

    scheduleWorkflowWorldStartup({ delayMs: 100 });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.cleanupStreamChunks).not.toHaveBeenCalled();
  });
});
