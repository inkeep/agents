import { describe, expect, it, vi } from 'vitest';
import { audit } from '../audit';
import type { AuditContext, EntityEffectRegistry } from '../types';

const mockCtx = {
  manageDb: {} as any,
  runDb: {} as any,
  scopes: { tenantId: 'tenant-1', projectId: 'project-1' },
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
} satisfies AuditContext;

describe('audit', () => {
  it('captures check function result in entries', async () => {
    const checkResult = { missingWorkflows: [], orphanedWorkflows: [] };
    const registry: EntityEffectRegistry = {
      scheduled_triggers: {
        check: vi.fn().mockResolvedValue(checkResult),
      },
    };

    const report = await audit(registry, mockCtx);

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toEqual({ table: 'scheduled_triggers', result: checkResult });
    expect(report.checkedEntities).toEqual(['scheduled_triggers']);
  });

  it('puts entities without check function in skippedEntities', async () => {
    const registry: EntityEffectRegistry = {
      tools: { onDeleted: vi.fn().mockResolvedValue(undefined) },
    };

    const report = await audit(registry, mockCtx);

    expect(report.skippedEntities).toEqual(['tools']);
    expect(report.checkedEntities).toHaveLength(0);
    expect(report.entries).toHaveLength(0);
  });

  it('captures check function errors without throwing', async () => {
    const registry: EntityEffectRegistry = {
      scheduled_triggers: {
        check: vi.fn().mockRejectedValue(new Error('db connection failed')),
      },
      tools: {
        check: vi.fn().mockResolvedValue({ orphanedRows: [] }),
      },
    };

    const report = await audit(registry, mockCtx);

    expect(report.entries).toHaveLength(2);

    const triggerEntry = report.entries.find((e) => e.table === 'scheduled_triggers');
    expect(triggerEntry?.error).toBe('db connection failed');
    expect(triggerEntry?.result).toBeNull();

    const toolsEntry = report.entries.find((e) => e.table === 'tools');
    expect(toolsEntry?.error).toBeUndefined();
    expect(report.checkedEntities).toContain('scheduled_triggers');
    expect(report.checkedEntities).toContain('tools');
  });

  it('returns empty report for empty registry', async () => {
    const registry: EntityEffectRegistry = {};

    const report = await audit(registry, mockCtx);

    expect(report.entries).toHaveLength(0);
    expect(report.checkedEntities).toHaveLength(0);
    expect(report.skippedEntities).toHaveLength(0);
  });
});
