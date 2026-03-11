import type { PullV3Options } from './introspect';

export interface ConflictItem {
  table: string;
  primaryKey: Record<string, string>;
  ourDiffType: string;
  theirDiffType: string;
  base: Record<string, unknown> | null;
  ours: Record<string, unknown> | null;
  theirs: Record<string, unknown> | null;
}

export interface ConflictResolution {
  table: string;
  primaryKey: Record<string, string>;
  rowDefaultPick: 'ours' | 'theirs';
  columns?: Record<string, 'ours' | 'theirs'>;
}

export async function resolveConflictsInteractive(
  conflicts: ConflictItem[],
  _options: PullV3Options
): Promise<ConflictResolution[]> {
  // US-010 will implement the full interactive UX.
  // For now, default all conflicts to 'theirs' (accept remote changes).
  return conflicts.map((conflict) => ({
    table: conflict.table,
    primaryKey: conflict.primaryKey,
    rowDefaultPick: 'theirs' as const,
  }));
}
