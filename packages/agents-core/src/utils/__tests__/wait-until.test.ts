import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWaitUntil = vi.fn();
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@vercel/functions', () => ({
  waitUntil: mockWaitUntil,
}));

vi.mock('../logger', () => ({
  getLogger: () => mockLogger,
}));

describe('getWaitUntil', () => {
  let originalVercel: string | undefined;

  beforeEach(async () => {
    originalVercel = process.env.VERCEL;
    delete process.env.VERCEL;
    vi.clearAllMocks();
    const mod = await import('../wait-until');
    mod._resetWaitUntilCache();
  });

  afterEach(() => {
    if (originalVercel !== undefined) {
      process.env.VERCEL = originalVercel;
    } else {
      delete process.env.VERCEL;
    }
  });

  it('should return undefined when process.env.VERCEL is not set', async () => {
    delete process.env.VERCEL;
    const { getWaitUntil } = await import('../wait-until');
    const result = await getWaitUntil();
    expect(result).toBeUndefined();
  });

  it('should return waitUntil function when VERCEL is set and import succeeds', async () => {
    process.env.VERCEL = '1';
    const { getWaitUntil, _resetWaitUntilCache } = await import('../wait-until');
    _resetWaitUntilCache();
    const result = await getWaitUntil();
    expect(result).toBe(mockWaitUntil);
  });

  it('should return undefined when VERCEL is set but import fails, and log warning', async () => {
    process.env.VERCEL = '1';

    // Reset modules to install a throwing mock
    vi.resetModules();
    vi.doMock('@vercel/functions', () => {
      throw new Error('Module not found');
    });
    vi.doMock('../logger', () => ({
      getLogger: () => mockLogger,
    }));

    const { getWaitUntil } = await import('../wait-until');
    const result = await getWaitUntil();
    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'Failed to import @vercel/functions, waitUntil unavailable'
    );

    // Restore original mock for subsequent tests
    vi.resetModules();
    vi.doMock('@vercel/functions', () => ({
      waitUntil: mockWaitUntil,
    }));
    vi.doMock('../logger', () => ({
      getLogger: () => mockLogger,
    }));
  });

  it('should cache result after first call (lazy singleton)', async () => {
    process.env.VERCEL = '1';
    const { getWaitUntil, _resetWaitUntilCache } = await import('../wait-until');
    _resetWaitUntilCache();

    const result1 = await getWaitUntil();
    const result2 = await getWaitUntil();

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();
    // Same reference returned — singleton cached
    expect(result1).toBe(result2);
  });

  it('should re-evaluate after _resetWaitUntilCache is called', async () => {
    process.env.VERCEL = '1';
    const { getWaitUntil, _resetWaitUntilCache } = await import('../wait-until');
    _resetWaitUntilCache();

    // First call with VERCEL set → returns a function
    const result1 = await getWaitUntil();
    expect(result1).toBeDefined();
    expect(typeof result1).toBe('function');

    // Reset cache and unset VERCEL → should re-evaluate and return undefined
    _resetWaitUntilCache();
    delete process.env.VERCEL;
    const result2 = await getWaitUntil();
    expect(result2).toBeUndefined();
  });

  it('should return undefined when process.env.VERCEL is empty string', async () => {
    process.env.VERCEL = '';
    const { getWaitUntil, _resetWaitUntilCache } = await import('../wait-until');
    _resetWaitUntilCache();
    const result = await getWaitUntil();
    expect(result).toBeUndefined();
  });
});
