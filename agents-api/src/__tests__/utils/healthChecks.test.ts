import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkManageDb, checkRunDb } from '../../utils/healthChecks';

describe('healthChecks', () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkManageDb', () => {
    it('returns true when database query succeeds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      const mockPool = { query: mockQuery } as any;

      const resultPromise = checkManageDb(mockPool);
      await vi.advanceTimersByTimeAsync(0);
      const result = await resultPromise;

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns false when database query throws error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));
      const mockPool = { query: mockQuery } as any;

      const resultPromise = checkManageDb(mockPool);
      await vi.advanceTimersByTimeAsync(0);
      const result = await resultPromise;

      expect(result).toBe(false);
    });

    it('returns false when database query times out', async () => {
      mockQuery.mockImplementationOnce(() => new Promise(() => {}));
      const mockPool = { query: mockQuery } as any;

      const resultPromise = checkManageDb(mockPool);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await resultPromise;

      expect(result).toBe(false);
    });

    it('succeeds if query completes within timeout', async () => {
      mockQuery.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ rows: [{ '?column?': 1 }] }), 1000);
          })
      );
      const mockPool = { query: mockQuery } as any;

      const resultPromise = checkManageDb(mockPool);
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(result).toBe(true);
    });
  });

  describe('checkRunDb', () => {
    it('returns true when database query succeeds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      const mockClient = { $client: { query: mockQuery } } as any;

      const resultPromise = checkRunDb(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      const result = await resultPromise;

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns false when database query throws error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));
      const mockClient = { $client: { query: mockQuery } } as any;

      const resultPromise = checkRunDb(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      const result = await resultPromise;

      expect(result).toBe(false);
    });

    it('returns false when database query times out', async () => {
      mockQuery.mockImplementationOnce(() => new Promise(() => {}));
      const mockClient = { $client: { query: mockQuery } } as any;

      const resultPromise = checkRunDb(mockClient);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await resultPromise;

      expect(result).toBe(false);
    });

    it('returns false when client has no $client property', async () => {
      const mockClient = {} as any;

      const resultPromise = checkRunDb(mockClient);
      await vi.advanceTimersByTimeAsync(0);
      const result = await resultPromise;

      expect(result).toBe(false);
    });
  });
});
