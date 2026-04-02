import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryWithBackoff } from '../retry-client';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on AbortError and succeeds', async () => {
    const abortError = new DOMException('Timeout', 'AbortError');
    const fn = vi.fn().mockRejectedValueOnce(abortError).mockResolvedValue('recovered');

    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 status', async () => {
    const rateLimitError = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx status', async () => {
    const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const fn = vi.fn().mockRejectedValueOnce(serverError).mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on TypeError (network errors)', async () => {
    const networkError = new TypeError('fetch failed');
    const fn = vi.fn().mockRejectedValueOnce(networkError).mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable errors', async () => {
    const clientError = Object.assign(new Error('Not Found'), { status: 404 });
    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(retryWithBackoff(fn)).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max attempts exhausted', async () => {
    vi.useRealTimers();
    const serverError = Object.assign(new Error('Server Error'), { status: 503 });
    const fn = vi.fn().mockRejectedValue(serverError);

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, maxDelayMs: 1, label: 'test' })
    ).rejects.toThrow('Server Error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects Retry-After header', async () => {
    const headers = new Headers();
    headers.set('Retry-After', '5');
    const error = Object.assign(new Error('Rate limited'), { status: 429, headers });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.advanceTimersByTimeAsync(5100);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('caps delay at maxDelayMs', async () => {
    vi.useRealTimers();
    const serverError = Object.assign(new Error('Server Error'), { status: 500 });
    const fn = vi.fn().mockRejectedValue(serverError);

    await expect(
      retryWithBackoff(fn, { maxAttempts: 2, maxDelayMs: 1, label: 'test' })
    ).rejects.toThrow('Server Error');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
