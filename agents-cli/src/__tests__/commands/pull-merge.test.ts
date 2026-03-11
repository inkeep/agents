import { describe, expect, it } from 'vitest';
import { resolveConflictsInteractive } from '../../commands/pull-v4/merge-conflicts';

describe('resolveConflictsInteractive', () => {
  it('should default all conflicts to theirs', async () => {
    const conflicts = [
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

    const resolutions = await resolveConflictsInteractive(conflicts, {});

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

  it('should handle empty conflicts array', async () => {
    const resolutions = await resolveConflictsInteractive([], {});
    expect(resolutions).toEqual([]);
  });
});
