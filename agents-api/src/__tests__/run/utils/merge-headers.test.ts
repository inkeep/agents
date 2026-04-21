import { describe, expect, it } from 'vitest';
import { mergeHeadersWithoutOverrides } from '../../../domains/run/utils/merge-headers';

describe('mergeHeadersWithoutOverrides', () => {
  it('preserves all existing headers', () => {
    const result = mergeHeadersWithoutOverrides(
      { Authorization: 'Bearer trusted', 'x-inkeep-tenant-id': 'tenant-1' },
      {}
    );
    expect(result).toEqual({
      Authorization: 'Bearer trusted',
      'x-inkeep-tenant-id': 'tenant-1',
    });
  });

  it('adds non-conflicting forwarded headers', () => {
    const result = mergeHeadersWithoutOverrides(
      { Authorization: 'Bearer trusted' },
      { 'x-custom': 'value' }
    );
    expect(result.Authorization).toBe('Bearer trusted');
    expect(result['x-custom']).toBe('value');
  });

  it('blocks forwarded headers that conflict with existing headers (exact case)', () => {
    const result = mergeHeadersWithoutOverrides(
      { Authorization: 'Bearer trusted', 'x-inkeep-tenant-id': 'tenant-1' },
      { Authorization: 'Bearer attacker', 'x-inkeep-tenant-id': 'attacker-tenant' }
    );
    expect(result.Authorization).toBe('Bearer trusted');
    expect(result['x-inkeep-tenant-id']).toBe('tenant-1');
  });

  it('blocks forwarded headers with different casing (case-insensitive)', () => {
    const result = mergeHeadersWithoutOverrides(
      { Authorization: 'Bearer trusted', 'x-inkeep-tenant-id': 'tenant-1' },
      { authorization: 'Bearer attacker', 'X-INKEEP-TENANT-ID': 'attacker-tenant' }
    );
    expect(result.Authorization).toBe('Bearer trusted');
    expect(result['x-inkeep-tenant-id']).toBe('tenant-1');
    expect(result.authorization).toBeUndefined();
    expect(result['X-INKEEP-TENANT-ID']).toBeUndefined();
  });

  it('handles undefined existing headers', () => {
    const result = mergeHeadersWithoutOverrides(undefined, { 'x-custom': 'value' });
    expect(result).toEqual({ 'x-custom': 'value' });
  });

  it('handles empty forwarded headers', () => {
    const result = mergeHeadersWithoutOverrides({ Authorization: 'Bearer trusted' }, {});
    expect(result).toEqual({ Authorization: 'Bearer trusted' });
  });

  it('allows non-overlapping headers while blocking overlapping ones', () => {
    const result = mergeHeadersWithoutOverrides(
      {
        Authorization: 'Bearer trusted',
        'x-inkeep-tenant-id': 'tenant-1',
        'x-inkeep-project-id': 'project-1',
      },
      {
        Authorization: 'Bearer attacker',
        'x-inkeep-tenant-id': 'attacker-tenant',
        'x-custom-forwarded': 'allowed',
        'x-another-custom': 'also-allowed',
      }
    );
    expect(result.Authorization).toBe('Bearer trusted');
    expect(result['x-inkeep-tenant-id']).toBe('tenant-1');
    expect(result['x-inkeep-project-id']).toBe('project-1');
    expect(result['x-custom-forwarded']).toBe('allowed');
    expect(result['x-another-custom']).toBe('also-allowed');
  });
});
