import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupUserScheduledTriggers } from '../cleanup';

vi.mock('../../data-access/runtime/projects', () => ({
  listProjectsMetadata: vi.fn(),
}));

vi.mock('../../dolt/ref-helpers', () => ({
  resolveProjectMainRefs: vi.fn(),
}));

vi.mock('../../dolt/ref-scope', () => ({
  withRef: vi.fn(),
}));

vi.mock('../../data-access/manage/scheduledTriggers', () => ({
  deleteScheduledTriggersByRunAsUserId: vi.fn(),
}));

vi.mock('../../data-access/manage/triggers', () => ({
  deleteTriggersByRunAsUserId: vi.fn(),
}));

const { listProjectsMetadata } = await import('../../data-access/runtime/projects');
const { resolveProjectMainRefs } = await import('../../dolt/ref-helpers');
const { withRef } = await import('../../dolt/ref-scope');
const { deleteScheduledTriggersByRunAsUserId } = await import(
  '../../data-access/manage/scheduledTriggers'
);
const { deleteTriggersByRunAsUserId } = await import('../../data-access/manage/triggers');

const listProjectsMetadataMock = vi.mocked(listProjectsMetadata);
const resolveProjectMainRefsMock = vi.mocked(resolveProjectMainRefs);
const withRefMock = vi.mocked(withRef);
const deleteScheduledByUserMock = vi.mocked(deleteScheduledTriggersByRunAsUserId);
const deleteWebhookByUserMock = vi.mocked(deleteTriggersByRunAsUserId);

describe('cleanupUserScheduledTriggers', () => {
  const mockRunDb = {} as any;
  const mockPool = {
    connect: vi.fn(),
  } as any;
  const mockConnection = {
    release: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.connect.mockResolvedValue(mockConnection);
    deleteScheduledByUserMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));
    deleteWebhookByUserMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));
  });

  it('should be a no-op when tenant has no projects', async () => {
    listProjectsMetadataMock.mockReturnValue(vi.fn().mockResolvedValue([]));

    await cleanupUserScheduledTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(listProjectsMetadataMock).toHaveBeenCalledWith(mockRunDb);
    expect(mockPool.connect).not.toHaveBeenCalled();
    expect(withRefMock).not.toHaveBeenCalled();
  });

  it('should resolve refs and call withRef for each project', async () => {
    const projects = [
      { id: 'proj-1', tenantId: 'tenant-1' },
      { id: 'proj-2', tenantId: 'tenant-1' },
    ];
    listProjectsMetadataMock.mockReturnValue(vi.fn().mockResolvedValue(projects));

    const ref1 = { type: 'branch' as const, name: 'tenant-1_proj-1_main', hash: 'abc' };
    const ref2 = { type: 'branch' as const, name: 'tenant-1_proj-2_main', hash: 'def' };
    resolveProjectMainRefsMock.mockReturnValue(
      vi.fn().mockResolvedValue([
        { projectId: 'proj-1', ref: ref1 },
        { projectId: 'proj-2', ref: ref2 },
      ])
    );

    withRefMock.mockImplementation(async (_pool, _ref, fn) => {
      return fn({} as any);
    });

    await cleanupUserScheduledTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(mockPool.connect).toHaveBeenCalledOnce();
    expect(mockConnection.release).toHaveBeenCalledOnce();
    expect(withRefMock).toHaveBeenCalledTimes(2);
    expect(withRefMock).toHaveBeenCalledWith(mockPool, ref1, expect.any(Function), {
      commit: true,
      commitMessage: 'Remove triggers for departing user user-1',
    });
    expect(withRefMock).toHaveBeenCalledWith(mockPool, ref2, expect.any(Function), {
      commit: true,
      commitMessage: 'Remove triggers for departing user user-1',
    });
  });

  it('should skip projects with unresolvable branches', async () => {
    const projects = [
      { id: 'proj-good', tenantId: 'tenant-1' },
      { id: 'proj-bad', tenantId: 'tenant-1' },
    ];
    listProjectsMetadataMock.mockReturnValue(vi.fn().mockResolvedValue(projects));

    const goodRef = { type: 'branch' as const, name: 'tenant-1_proj-good_main', hash: 'abc' };
    resolveProjectMainRefsMock.mockReturnValue(
      vi.fn().mockResolvedValue([{ projectId: 'proj-good', ref: goodRef }])
    );

    withRefMock.mockImplementation(async (_pool, _ref, fn) => {
      return fn({} as any);
    });

    await cleanupUserScheduledTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(withRefMock).toHaveBeenCalledTimes(1);
    expect(withRefMock).toHaveBeenCalledWith(mockPool, goodRef, expect.any(Function), {
      commit: true,
      commitMessage: 'Remove triggers for departing user user-1',
    });
  });

  it('should continue processing other projects if one fails', async () => {
    const projects = [
      { id: 'proj-fail', tenantId: 'tenant-1' },
      { id: 'proj-ok', tenantId: 'tenant-1' },
    ];
    listProjectsMetadataMock.mockReturnValue(vi.fn().mockResolvedValue(projects));

    const ref1 = { type: 'branch' as const, name: 'tenant-1_proj-fail_main', hash: 'abc' };
    const ref2 = { type: 'branch' as const, name: 'tenant-1_proj-ok_main', hash: 'def' };
    resolveProjectMainRefsMock.mockReturnValue(
      vi.fn().mockResolvedValue([
        { projectId: 'proj-fail', ref: ref1 },
        { projectId: 'proj-ok', ref: ref2 },
      ])
    );

    withRefMock.mockImplementation(async (_pool, ref, fn) => {
      if ((ref as any).name === 'tenant-1_proj-fail_main') {
        throw new Error('Branch operation failed');
      }
      return fn({} as any);
    });

    await cleanupUserScheduledTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(withRefMock).toHaveBeenCalledTimes(2);
  });

  it('should call both deleteScheduledTriggersByRunAsUserId and deleteTriggersByRunAsUserId in the same withRef callback', async () => {
    const projects = [{ id: 'proj-1', tenantId: 'tenant-1' }];
    listProjectsMetadataMock.mockReturnValue(vi.fn().mockResolvedValue(projects));

    const ref1 = { type: 'branch' as const, name: 'tenant-1_proj-1_main', hash: 'abc' };
    resolveProjectMainRefsMock.mockReturnValue(
      vi.fn().mockResolvedValue([{ projectId: 'proj-1', ref: ref1 }])
    );

    withRefMock.mockImplementation(async (_pool, _ref, fn) => {
      return fn({} as any);
    });

    const scheduledDeleteFn = vi.fn().mockResolvedValue(undefined);
    const webhookDeleteFn = vi.fn().mockResolvedValue(undefined);
    deleteScheduledByUserMock.mockReturnValue(scheduledDeleteFn);
    deleteWebhookByUserMock.mockReturnValue(webhookDeleteFn);

    await cleanupUserScheduledTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(scheduledDeleteFn).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'proj-1',
      runAsUserId: 'user-1',
    });
    expect(webhookDeleteFn).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'proj-1',
      runAsUserId: 'user-1',
    });
  });

  it('should always release the connection even if ref resolution fails', async () => {
    const projects = [{ id: 'proj-1', tenantId: 'tenant-1' }];
    listProjectsMetadataMock.mockReturnValue(vi.fn().mockResolvedValue(projects));

    resolveProjectMainRefsMock.mockReturnValue(
      vi.fn().mockRejectedValue(new Error('DB connection error'))
    );

    await expect(
      cleanupUserScheduledTriggers({
        tenantId: 'tenant-1',
        userId: 'user-1',
        runDb: mockRunDb,
        manageDbPool: mockPool,
      })
    ).rejects.toThrow('DB connection error');

    expect(mockConnection.release).toHaveBeenCalledOnce();
  });
});
