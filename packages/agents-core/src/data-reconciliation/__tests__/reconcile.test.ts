import { describe, expect, it, vi } from 'vitest';
import { reconcile } from '../reconcile';
import type { EntityDiff, EntityEffectRegistry, ReconcileContext } from '../types';

const mockCtx = {
  manageDb: {} as any,
  runDb: {} as any,
  scopes: { tenantId: 'tenant-1', projectId: 'project-1' },
  fullBranchName: 'tenant-1_project-1_main',
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
} satisfies ReconcileContext;

describe('reconcile', () => {
  it('calls onCreated handler for insert diffs', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    const registry: EntityEffectRegistry = {
      scheduled_triggers: { onCreated },
    };
    const diffs: EntityDiff[] = [
      {
        table: 'scheduled_triggers',
        operation: 'insert',
        primaryKey: { id: 'trigger-1' },
        before: null,
        after: { id: 'trigger-1', name: 'test' } as any,
      },
    ];

    const result = await reconcile(registry, diffs, mockCtx);

    expect(onCreated).toHaveBeenCalledWith({ id: 'trigger-1', name: 'test' }, mockCtx);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]).toEqual({
      table: 'scheduled_triggers',
      operation: 'insert',
      primaryKey: { id: 'trigger-1' },
    });
  });

  it('calls onUpdated handler for update diffs', async () => {
    const onUpdated = vi.fn().mockResolvedValue(undefined);
    const registry: EntityEffectRegistry = {
      tools: { onUpdated },
    };
    const before = { id: 'tool-1', name: 'old' } as any;
    const after = { id: 'tool-1', name: 'new' } as any;
    const diffs: EntityDiff[] = [
      {
        table: 'tools',
        operation: 'update',
        primaryKey: { id: 'tool-1' },
        before,
        after,
      },
    ];

    const result = await reconcile(registry, diffs, mockCtx);

    expect(onUpdated).toHaveBeenCalledWith(before, after, mockCtx);
    expect(result.applied).toHaveLength(1);
  });

  it('calls onDeleted handler for delete diffs', async () => {
    const onDeleted = vi.fn().mockResolvedValue(undefined);
    const registry: EntityEffectRegistry = {
      agent: { onDeleted },
    };
    const before = { id: 'agent-1' } as any;
    const diffs: EntityDiff[] = [
      {
        table: 'agent',
        operation: 'delete',
        primaryKey: { id: 'agent-1' },
        before,
        after: null,
      },
    ];

    const result = await reconcile(registry, diffs, mockCtx);

    expect(onDeleted).toHaveBeenCalledWith(before, mockCtx);
    expect(result.applied).toHaveLength(1);
  });

  it('skips diffs for unregistered tables', async () => {
    const registry: EntityEffectRegistry = {};
    const diffs: EntityDiff[] = [
      {
        table: 'scheduled_triggers',
        operation: 'insert',
        primaryKey: { id: '1' },
        before: null,
        after: { id: '1' } as any,
      },
    ];

    const result = await reconcile(registry, diffs, mockCtx);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('no registry entry');
  });

  it('skips diffs where handler for the operation is undefined', async () => {
    const registry: EntityEffectRegistry = {
      tools: { onDeleted: vi.fn().mockResolvedValue(undefined) },
    };
    const diffs: EntityDiff[] = [
      {
        table: 'tools',
        operation: 'insert',
        primaryKey: { id: 'tool-1' },
        before: null,
        after: { id: 'tool-1' } as any,
      },
    ];

    const result = await reconcile(registry, diffs, mockCtx);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('no handler for insert');
  });

  it('captures handler errors in failed[] without throwing', async () => {
    const onCreated = vi.fn().mockRejectedValue(new Error('workflow start failed'));
    const registry: EntityEffectRegistry = {
      scheduled_triggers: { onCreated },
    };
    const diffs: EntityDiff[] = [
      {
        table: 'scheduled_triggers',
        operation: 'insert',
        primaryKey: { id: 'trigger-1' },
        before: null,
        after: { id: 'trigger-1' } as any,
      },
    ];

    const result = await reconcile(registry, diffs, mockCtx);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe('workflow start failed');
    expect(result.applied).toHaveLength(0);
    expect(mockCtx.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'scheduled_triggers',
        operation: 'insert',
        error: 'workflow start failed',
      }),
      expect.stringContaining('Reconcile effect failed')
    );
  });

  it('returns empty result for empty diffs array', async () => {
    const registry: EntityEffectRegistry = {
      scheduled_triggers: { onCreated: vi.fn() },
    };

    const result = await reconcile(registry, [], mockCtx);

    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('processes multiple diffs correctly', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn().mockRejectedValue(new Error('cascade failed'));
    const registry: EntityEffectRegistry = {
      scheduled_triggers: { onCreated },
      tools: { onDeleted },
    };
    const diffs: EntityDiff[] = [
      {
        table: 'scheduled_triggers',
        operation: 'insert',
        primaryKey: { id: 'trigger-1' },
        before: null,
        after: { id: 'trigger-1' } as any,
      },
      {
        table: 'tools',
        operation: 'delete',
        primaryKey: { id: 'tool-1' },
        before: { id: 'tool-1' } as any,
        after: null,
      },
      {
        table: 'context_configs',
        operation: 'insert',
        primaryKey: { id: 'cc-1' },
        before: null,
        after: { id: 'cc-1' } as any,
      },
    ];

    const result = await reconcile(registry, diffs, mockCtx);

    expect(result.applied).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('no registry entry');
  });
});
