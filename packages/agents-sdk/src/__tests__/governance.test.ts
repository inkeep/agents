import { describe, expect, it, vi } from 'vitest';
import { govern } from '../governance';

describe('govern interceptor', () => {
  it('should execute handler when policy returns true', async () => {
    const handler = vi.fn().mockResolvedValue('success');
    const governed = govern(handler, {
      policy: async (args) => args.allowed === true,
    });

    const result = await governed({ allowed: true });
    expect(result).toBe('success');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ allowed: true });
  });

  it('should block execution and throw error when policy returns false (fail-closed)', async () => {
    const handler = vi.fn().mockResolvedValue('success');
    const governed = govern(handler, {
      policy: async (args) => args.allowed === true,
    });

    await expect(governed({ allowed: false })).rejects.toThrow(
      'Governance policy check failed: execution blocked by fail-closed contract'
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('should block execution when policy throws an exception (fail-closed contract)', async () => {
    const handler = vi.fn().mockResolvedValue('success');
    const governed = govern(handler, {
      policy: async () => {
        throw new Error('Policy server timeout');
      },
    });

    await expect(governed({ param: 'test' })).rejects.toThrow(
      'Governance exception: Policy server timeout'
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('should invoke custom onDeny handler when governance blocks execution', async () => {
    const handler = vi.fn().mockResolvedValue('success');
    const onDeny = vi.fn().mockReturnValue('custom_denied_response');

    const governed = govern(handler, {
      policy: () => false,
      onDeny,
    });

    const result = await governed({ param: 'test' });
    expect(result).toBe('custom_denied_response');
    expect(handler).not.toHaveBeenCalled();
    expect(onDeny).toHaveBeenCalledTimes(1);
  });
});
