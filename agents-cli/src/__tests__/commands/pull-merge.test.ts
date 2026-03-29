import type { ConflictItem } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';

const SAMPLE_CONFLICTS: ConflictItem[] = [
  {
    table: 'agent',
    primaryKey: { id: 'agent-1' },
    ourDiffType: 'modified',
    theirDiffType: 'modified',
    base: { id: 'agent-1', name: 'Old' },
    ours: { id: 'agent-1', name: 'Local' },
    theirs: { id: 'agent-1', name: 'Remote' },
  },
  {
    table: 'tool',
    primaryKey: { id: 'tool-1' },
    ourDiffType: 'modified',
    theirDiffType: 'removed',
    base: { id: 'tool-1', name: 'Tool' },
    ours: { id: 'tool-1', name: 'Updated Tool' },
    theirs: null,
  },
];

describe('resolveConflictsInteractive', () => {
  it('should auto-resolve all conflicts with --conflict-strategy ours', async () => {
    const { resolveConflictsInteractive } = await import('../../commands/pull-v4/merge-conflicts');

    const resolutions = await resolveConflictsInteractive(SAMPLE_CONFLICTS, {
      conflictStrategy: 'ours',
    });

    expect(resolutions).toHaveLength(2);
    expect(resolutions[0].rowDefaultPick).toBe('ours');
    expect(resolutions[1].rowDefaultPick).toBe('ours');
  });

  it('should auto-resolve all conflicts with --conflict-strategy theirs', async () => {
    const { resolveConflictsInteractive } = await import('../../commands/pull-v4/merge-conflicts');

    const resolutions = await resolveConflictsInteractive(SAMPLE_CONFLICTS, {
      conflictStrategy: 'theirs',
    });

    expect(resolutions).toHaveLength(2);
    expect(resolutions[0]).toEqual({
      table: 'agent',
      primaryKey: { id: 'agent-1' },
      rowDefaultPick: 'theirs',
    });
    expect(resolutions[1]).toEqual({
      table: 'tool',
      primaryKey: { id: 'tool-1' },
      rowDefaultPick: 'theirs',
    });
  });

  it('should handle empty conflicts array with strategy', async () => {
    const { resolveConflictsInteractive } = await import('../../commands/pull-v4/merge-conflicts');

    const resolutions = await resolveConflictsInteractive([], {
      conflictStrategy: 'ours',
    });

    expect(resolutions).toEqual([]);
  });
});
