import { describe, expect, it } from 'vitest';
import { isMergeRoute } from '../ref-middleware';

describe('isMergeRoute', () => {
  it('matches merge preview path', () => {
    expect(isMergeRoute('/tenants/t1/projects/p1/branches/merge/preview')).toBe(true);
  });

  it('matches merge execute path', () => {
    expect(isMergeRoute('/tenants/t1/projects/p1/branches/merge')).toBe(true);
  });

  it('does not match regular branch paths', () => {
    expect(isMergeRoute('/tenants/t1/projects/p1/branches')).toBe(false);
    expect(isMergeRoute('/tenants/t1/projects/p1/branches/main')).toBe(false);
    expect(isMergeRoute('/tenants/t1/projects/p1/branches/feature-1')).toBe(false);
  });

  it('does not match other paths containing merge', () => {
    expect(isMergeRoute('/tenants/t1/projects/p1/merge')).toBe(false);
  });
});
