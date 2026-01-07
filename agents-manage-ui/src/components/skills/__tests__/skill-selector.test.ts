import { describe, expect, it } from 'vitest';
import { reorderSkills } from '../skill-selector';

describe('reorderSkills', () => {
  const base = [
    { id: 'a', index: 0 },
    { id: 'b', index: 1 },
    { id: 'c', index: 2 },
  ];

  it('reorders items when moving down', () => {
    const result = reorderSkills(base, 'a', 'c');
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('reorders items when moving up', () => {
    const result = reorderSkills(base, 'c', 'a');
    expect(result.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns original when ids missing', () => {
    const result = reorderSkills(base, 'x', 'a');
    expect(result).toEqual(base);
  });
});
