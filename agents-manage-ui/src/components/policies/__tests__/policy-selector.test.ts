import { describe, expect, it } from 'vitest';
import { reorderPolicies } from '../policy-selector';

describe('reorderPolicies', () => {
  const base = [
    { id: 'a', index: 0 },
    { id: 'b', index: 1 },
    { id: 'c', index: 2 },
  ];

  it('reorders items when moving down', () => {
    const result = reorderPolicies(base, 'a', 'c');
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('reorders items when moving up', () => {
    const result = reorderPolicies(base, 'c', 'a');
    expect(result.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns original when ids missing', () => {
    const result = reorderPolicies(base, 'x', 'a');
    expect(result).toEqual(base);
  });
});
