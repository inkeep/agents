import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWaitUntil, mockLoggerWarn } = vi.hoisted(() => ({
  mockWaitUntil: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: mockWaitUntil,
}));

vi.mock('../logger', () => ({
  getLogger: () => ({
    warn: mockLoggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('getWaitUntil', () => {
  const originalEnv = process.env.VERCEL;

  beforeEach(async () => {
    const { _resetWaitUntilCache } = await import('../wait-until');
    _resetWaitUntilCache();
    vi.clearAllMocks();
    delete process.env.VERCEL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VERCEL = originalEnv;
    } else {
      delete process.env.VERCEL;
    }
  });

  it('returns undefined when process.env.VERCEL is not set', async () => {
    const { getWaitUntil } = await import('../wait-until');
    const result = await getWaitUntil();
    expect(result).toBeUndefined();
  });

  it('returns the waitUntil function when VERCEL is set and import succeeds', async () => {
    process.env.VERCEL = '1';
    const { getWaitUntil } = await import('../wait-until');
    const result = await getWaitUntil();
    expect(result).toBe(mockWaitUntil);
  });

  it('caches result — second call does not re-evaluate', async () => {
    process.env.VERCEL = '1';
    const { getWaitUntil } = await import('../wait-until');

    const result1 = await getWaitUntil();
    const result2 = await getWaitUntil();

    expect(result1).toBe(mockWaitUntil);
    expect(result2).toBe(mockWaitUntil);
    expect(result1).toBe(result2);
  });

  it('_resetWaitUntilCache clears cache so next call re-evaluates', async () => {
    const { getWaitUntil, _resetWaitUntilCache } = await import('../wait-until');

    process.env.VERCEL = '1';
    const result1 = await getWaitUntil();
    expect(result1).toBe(mockWaitUntil);

    _resetWaitUntilCache();
    delete process.env.VERCEL;

    const result2 = await getWaitUntil();
    expect(result2).toBeUndefined();
  });
});

describe('getWaitUntil (import failure)', () => {
  const originalEnv = process.env.VERCEL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VERCEL = originalEnv;
    } else {
      delete process.env.VERCEL;
    }
  });

  it('returns undefined when VERCEL is set but import fails and logs warning', async () => {
    process.env.VERCEL = '1';

    vi.resetModules();

    vi.doMock('@vercel/functions', () => {
      throw new Error('Module not found');
    });

    const doMockLoggerWarn = vi.fn();
    vi.doMock('../logger', () => ({
      getLogger: () => ({
        warn: doMockLoggerWarn,
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    }));

    const { getWaitUntil: freshGetWaitUntil } = await import('../wait-until');
    const result = await freshGetWaitUntil();

    expect(result).toBeUndefined();
    expect(doMockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'Failed to import @vercel/functions, waitUntil unavailable'
    );

    delete process.env.VERCEL;
  });
});
