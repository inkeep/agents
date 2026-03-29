import type { ConflictItem } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import {
  formatEntityId,
  formatValue,
  getChangedColumns,
} from '../../commands/pull-v4/merge-ui/utils';

describe('getChangedColumns', () => {
  it('should return only changed columns', () => {
    const conflict: ConflictItem = {
      table: 'agent',
      primaryKey: { id: 'agent-1' },
      ourDiffType: 'modified',
      theirDiffType: 'modified',
      base: { id: 'agent-1', name: 'Base', model: 'gpt-4', temperature: 0.7 },
      ours: { id: 'agent-1', name: 'Local', model: 'gpt-4', temperature: 0.7 },
      theirs: { id: 'agent-1', name: 'Remote', model: 'gpt-4', temperature: 0.9 },
    };

    const changed = getChangedColumns(conflict);
    expect(changed).toContain('name');
    expect(changed).toContain('temperature');
    expect(changed).not.toContain('model');
    expect(changed).not.toContain('id');
  });

  it('should skip primary key columns', () => {
    const conflict: ConflictItem = {
      table: 'agent',
      primaryKey: { id: 'agent-1' },
      ourDiffType: 'modified',
      theirDiffType: 'modified',
      base: null,
      ours: { id: 'agent-1', name: 'Local' },
      theirs: { id: 'agent-2', name: 'Remote' },
    };

    const changed = getChangedColumns(conflict);
    expect(changed).not.toContain('id');
    expect(changed).toContain('name');
  });

  it('should skip timestamp columns', () => {
    const conflict: ConflictItem = {
      table: 'agent',
      primaryKey: { id: 'agent-1' },
      ourDiffType: 'modified',
      theirDiffType: 'modified',
      base: null,
      ours: { id: 'agent-1', name: 'Local', created_at: '2024-01-01', updated_at: '2024-01-02' },
      theirs: { id: 'agent-1', name: 'Remote', created_at: '2024-01-03', updated_at: '2024-01-04' },
    };

    const changed = getChangedColumns(conflict);
    expect(changed).not.toContain('created_at');
    expect(changed).not.toContain('updated_at');
    expect(changed).toContain('name');
  });

  it('should handle null ours (row removed locally)', () => {
    const conflict: ConflictItem = {
      table: 'tool',
      primaryKey: { id: 'tool-1' },
      ourDiffType: 'removed',
      theirDiffType: 'modified',
      base: { id: 'tool-1', name: 'Tool' },
      ours: null,
      theirs: { id: 'tool-1', name: 'Updated Tool', config: '{}' },
    };

    const changed = getChangedColumns(conflict);
    expect(changed).toContain('name');
    expect(changed).toContain('config');
    expect(changed).not.toContain('id');
  });

  it('should handle null theirs (row removed remotely)', () => {
    const conflict: ConflictItem = {
      table: 'tool',
      primaryKey: { id: 'tool-1' },
      ourDiffType: 'modified',
      theirDiffType: 'removed',
      base: { id: 'tool-1', name: 'Tool' },
      ours: { id: 'tool-1', name: 'Updated Tool' },
      theirs: null,
    };

    const changed = getChangedColumns(conflict);
    expect(changed).toContain('name');
  });
});

describe('formatValue', () => {
  it('should format null/undefined as "null"', () => {
    expect(formatValue(null)).toBe('null');
    expect(formatValue(undefined)).toBe('null');
  });

  it('should format short strings as-is', () => {
    expect(formatValue('hello')).toBe('hello');
  });

  it('should return long strings without truncation', () => {
    const longString = 'a'.repeat(100);
    const result = formatValue(longString);
    expect(result).toBe(longString);
  });

  it('should format numbers as strings', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue(0.7)).toBe('0.7');
  });

  it('should pretty-print small objects', () => {
    expect(formatValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('should pretty-print large objects without truncation', () => {
    const large = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const result = formatValue(large);
    expect(result).toBe(JSON.stringify(large, null, 2));
  });
});

describe('formatEntityId', () => {
  it('should return single value for single-key PK', () => {
    expect(formatEntityId({ id: 'agent-1' })).toBe('agent-1');
  });

  it('should join multiple values for composite PK', () => {
    expect(formatEntityId({ table: 'agent', id: 'agent-1' })).toBe('agent/agent-1');
  });
});
