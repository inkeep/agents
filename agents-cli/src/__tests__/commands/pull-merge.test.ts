import { describe, expect, it, vi } from 'vitest';
import type { ConflictItem } from '../../commands/pull-v4/merge-conflicts';

vi.mock('@clack/prompts');

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

  it('should prompt interactively when no conflict strategy provided', async () => {
    const p = await import('@clack/prompts');
    vi.mocked(p.select).mockResolvedValueOnce('ours').mockResolvedValueOnce('theirs');
    vi.mocked(p.confirm).mockResolvedValueOnce(true);

    const { resolveConflictsInteractive } = await import('../../commands/pull-v4/merge-conflicts');

    const resolutions = await resolveConflictsInteractive(SAMPLE_CONFLICTS, {});

    expect(p.select).toHaveBeenCalledTimes(2);
    expect(p.confirm).toHaveBeenCalledTimes(1);
    expect(resolutions[0].rowDefaultPick).toBe('ours');
    expect(resolutions[1].rowDefaultPick).toBe('theirs');
  });

  it('should throw when user cancels selection', async () => {
    const p = await import('@clack/prompts');
    vi.mocked(p.select).mockResolvedValueOnce(Symbol.for('cancel'));
    vi.mocked(p.isCancel).mockReturnValueOnce(true);

    const { resolveConflictsInteractive } = await import('../../commands/pull-v4/merge-conflicts');

    await expect(resolveConflictsInteractive(SAMPLE_CONFLICTS, {})).rejects.toThrow(
      'Conflict resolution cancelled'
    );
  });

  it('should throw when user declines confirmation', async () => {
    const p = await import('@clack/prompts');
    vi.mocked(p.select).mockResolvedValueOnce('ours').mockResolvedValueOnce('theirs');
    vi.mocked(p.isCancel).mockReturnValue(false);
    vi.mocked(p.confirm).mockResolvedValueOnce(false);

    const { resolveConflictsInteractive } = await import('../../commands/pull-v4/merge-conflicts');

    await expect(resolveConflictsInteractive(SAMPLE_CONFLICTS, {})).rejects.toThrow(
      'Conflict resolution cancelled'
    );
  });
});
