import type { ConflictItem } from '@inkeep/agents-core';

const SKIP_COLUMNS = new Set(['created_at', 'updated_at']);

export function getChangedColumns(conflict: ConflictItem): string[] {
  const ours = conflict.ours ?? {};
  const theirs = conflict.theirs ?? {};
  const allKeys = Object.keys({ ...ours, ...theirs });
  return allKeys.filter((key) => {
    if (key in conflict.primaryKey) return false;
    if (SKIP_COLUMNS.has(key)) return false;
    return JSON.stringify(ours[key]) !== JSON.stringify(theirs[key]);
  });
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function formatEntityId(primaryKey: Record<string, string>): string {
  const values = Object.values(primaryKey);
  return values.join('/');
}

export function formatDiffType(diffType: string): string {
  switch (diffType) {
    case 'added':
      return 'added';
    case 'removed':
      return 'deleted';
    case 'modified':
      return 'modified';
    default:
      return diffType;
  }
}

export function diffTypeColor(diffType: string): string {
  switch (diffType) {
    case 'added':
      return 'green';
    case 'removed':
      return 'red';
    case 'modified':
      return 'yellow';
    default:
      return 'white';
  }
}
