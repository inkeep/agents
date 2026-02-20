import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  getLogger: () => mockLogger,
}));

const { withRetry, withRetryTransaction } = await import('../withRetry');

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns result on first success without retry', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('retries on transient SQLSTATE error and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'serialization failure' })
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { context: 'test-op' });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('retries on Node.js network error and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ECONNRESET', message: 'connection reset' })
      .mockResolvedValue('recovered');

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on pool timeout message and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const error = { cause: { code: '23505' }, message: 'unique violation' };
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('throws the original error after max retries exhausted', async () => {
    const error = { cause: { code: '40001' }, message: 'serialization failure' };
    const fn = vi.fn().mockRejectedValue(error);

    const promise = withRetry(fn, { maxRetries: 2 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10000);

    const result = await promise;
    expect(result).toBe(error);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
  });

  it('skips retry when noRetry is true', async () => {
    const error = { cause: { code: '40001' }, message: 'serialization failure' };
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { noRetry: true })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('computes backoff delay within expected bounds', async () => {
    const delays: number[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const originalSetTimeout = globalThis.setTimeout;

    vi.stubGlobal(
      'setTimeout',
      vi.fn((cb: () => void, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(cb, 0);
      })
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'fail' })
      .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'fail' })
      .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'fail' })
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { baseDelayMs: 100, maxDelayMs: 5000 });
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // attempt 0: 0.5 * min(5000, 100 * 2^0) = 0.5 * 100 = 50
    expect(delays[0]).toBe(50);
    // attempt 1: 0.5 * min(5000, 100 * 2^1) = 0.5 * 200 = 100
    expect(delays[1]).toBe(100);
    // attempt 2: 0.5 * min(5000, 100 * 2^2) = 0.5 * 400 = 200
    expect(delays[2]).toBe(200);

    vi.unstubAllGlobals();
  });

  it('caps delay at maxDelayMs', async () => {
    const delays: number[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const originalSetTimeout = globalThis.setTimeout;

    vi.stubGlobal(
      'setTimeout',
      vi.fn((cb: () => void, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(cb, 0);
      })
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'fail' })
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { baseDelayMs: 100, maxDelayMs: 50, maxRetries: 1 });
    await vi.advanceTimersByTimeAsync(10000);
    await promise;

    // random(1) * min(50, 100 * 2^0) = 1 * 50 = 50
    expect(delays[0]).toBe(50);

    vi.unstubAllGlobals();
  });

  it('logs structured retry information', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'serialization failure' })
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { context: 'myFunction', maxRetries: 3 });
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    const [logData, logMessage] = mockLogger.warn.mock.calls[0];
    expect(logMessage).toBe('Retrying transient database error');
    expect(logData.context).toBe('myFunction');
    expect(logData.attempt).toBe(1);
    expect(logData.maxRetries).toBe(3);
    expect(logData.errorCode).toBe('40001');
    expect(logData.errorMessage).toBe('serialization failure');
    expect(typeof logData.delayMs).toBe('number');
  });

  it('retries multiple times before success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'fail' })
      .mockRejectedValueOnce({ cause: { code: '40P01' }, message: 'deadlock' })
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { maxRetries: 3 });
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
  });

  it('supports custom retryable code set', async () => {
    const customCodes = new Set(['23505']);
    const error = { cause: { code: '23505' }, message: 'unique violation' };
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');

    const promise = withRetry(fn, { retryableCodes: customCodes });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withRetryTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('wraps db.transaction with retry', async () => {
    const txFn = vi.fn().mockResolvedValue('tx-result');
    const db = {
      transaction: vi.fn((fn: any) => fn('tx-client')),
    };

    const result = await withRetryTransaction(db, txFn);
    expect(result).toBe('tx-result');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(txFn).toHaveBeenCalledWith('tx-client');
  });

  it('retries the entire transaction on transient error', async () => {
    const txFn = vi.fn().mockResolvedValue('tx-result');
    const db = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'serialization failure' })
        .mockImplementation((fn: any) => fn('tx-client')),
    };

    const promise = withRetryTransaction(db, txFn, { context: 'test-tx' });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBe('tx-result');
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it('uses "transaction" as default context', async () => {
    const db = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce({ cause: { code: '40001' }, message: 'fail' })
        .mockImplementation((fn: any) => fn('tx')),
    };
    const txFn = vi.fn().mockResolvedValue('ok');

    const promise = withRetryTransaction(db, txFn);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0][0].context).toBe('transaction');
  });

  it('retries pool connection errors during transaction setup', async () => {
    const txFn = vi.fn().mockResolvedValue('ok');
    const db = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'))
        .mockImplementation((fn: any) => fn('tx')),
    };

    const promise = withRetryTransaction(db, txFn);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });
});
