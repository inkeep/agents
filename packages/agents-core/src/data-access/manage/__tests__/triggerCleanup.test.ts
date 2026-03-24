import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupUserTriggers } from '../triggerCleanup';

vi.mock('../../runtime/projects', () => ({
  listProjectsMetadata: vi.fn(),
}));

vi.mock('../../../dolt/ref-helpers', () => ({
  resolveProjectMainRefs: vi.fn(),
}));

vi.mock('../../../dolt/ref-scope', () => ({
  withRef: vi.fn(),
}));

vi.mock('../../runtime/scheduledTriggers', () => ({
  deleteScheduledTriggersByRunAsUserId: vi.fn(),
}));

vi.mock('../triggers', () => ({
  deleteTriggersByRunAsUserId: vi.fn(),
}));

const { listProjectsMetadata } = await import('../../runtime/projects');
const { resolveProjectMainRefs } = await import('../../../dolt/ref-helpers');
const { withRef } = await import('../../../dolt/ref-scope');
const { deleteScheduledTriggersByRunAsUserId } = await import(
  '../../runtime/scheduledTriggers'
);
const { deleteTriggersByRunAsUserId } = await import('../triggers');

const listProjectsMetadataMock = vi.mocked(listProjectsMetadata);
const resolveProjectMainRefsMock = vi.mocked(resolveProjectMainRefs);
const withRefMock = vi.mocked(withRef);
const deleteScheduledByUserMock = vi.mocked(deleteScheduledTriggersByRunAsUserId);
const deleteWebhookByUserMock = vi.mocked(deleteTriggersByRunAsUserId);

describe('cleanupUserTriggers', () => {
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

    await cleanupUserTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(listProjectsMetadataMock).toHaveBeenCalledWith(mockRunDb);
    expect(mockPool.connect).not.toHaveBeenCalled();
    expect(withRefMock).not.toHaveBeenCalled();
  });

  it('should delete scheduled triggers from runtime DB and webhook triggers via withRef', async () => {
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

    const scheduledDeleteFn = vi.fn().mockResolvedValue(undefined);
    deleteScheduledByUserMock.mockReturnValue(scheduledDeleteFn);

    await cleanupUserTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(deleteScheduledByUserMock).toHaveBeenCalledWith(mockRunDb);
    expect(scheduledDeleteFn).toHaveBeenCalledTimes(2);

    expect(withRefMock).toHaveBeenCalledTimes(2);
    expect(withRefMock).toHaveBeenCalledWith(mockPool, ref1, expect.any(Function), {
      commit: true,
      commitMessage: 'Remove triggers for departing user user-1',
    });
  });

  it('should continue processing other projects if one webhook trigger cleanup fails', async () => {
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

    await cleanupUserTriggers({
      tenantId: 'tenant-1',
      userId: 'user-1',
      runDb: mockRunDb,
      manageDbPool: mockPool,
    });

    expect(withRefMock).toHaveBeenCalledTimes(2);
  });

  it('should always release the connection even if ref resolution fails', async () => {
    const projects = [{ id: 'proj-1', tenantId: 'tenant-1' }];
    listProjectsMetadataMock.mockReturnValue(vi.fn().mockResolvedValue(projects));

    deleteScheduledByUserMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));

    resolveProjectMainRefsMock.mockReturnValue(
      vi.fn().mockRejectedValue(new Error('DB connection error'))
    );

    await expect(
      cleanupUserTriggers({
        tenantId: 'tenant-1',
        userId: 'user-1',
        runDb: mockRunDb,
        manageDbPool: mockPool,
      })
    ).rejects.toThrow('DB connection error');

    expect(mockConnection.release).toHaveBeenCalledOnce();
  });
});
