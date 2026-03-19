import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpRateLimitError, McpRateLimiter } from '../../utils/mcp-rate-limiter';

describe('McpRateLimiter', () => {
  let limiter: McpRateLimiter;

  beforeEach(() => {
    limiter = new McpRateLimiter({ timeoutMs: 2000 });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it('should allow requests under the per-minute limit', async () => {
    const config = { requestsPerMinute: 5 };

    for (let i = 0; i < 5; i++) {
      await limiter.acquireToken('tenant-1', 'tool-1', config);
    }

    const stats = limiter.getBucketStats('tenant-1', 'tool-1');
    expect(stats?.minuteCount).toBe(5);
  });

  it('should block when per-minute limit is reached and timeout', async () => {
    const shortLimiter = new McpRateLimiter({ timeoutMs: 200 });

    const config = { requestsPerMinute: 2 };

    await shortLimiter.acquireToken('tenant-1', 'tool-1', config);
    await shortLimiter.acquireToken('tenant-1', 'tool-1', config);

    await expect(shortLimiter.acquireToken('tenant-1', 'tool-1', config)).rejects.toThrow(
      McpRateLimitError
    );

    shortLimiter.destroy();
  });

  it('should enforce concurrent requests limit', async () => {
    const config = { concurrentRequests: 2 };

    await limiter.acquireToken('tenant-1', 'tool-1', config);
    await limiter.acquireToken('tenant-1', 'tool-1', config);

    const stats = limiter.getBucketStats('tenant-1', 'tool-1');
    expect(stats?.concurrentCount).toBe(2);

    const shortLimiter = new McpRateLimiter({ timeoutMs: 200 });

    await shortLimiter.acquireToken('tenant-1', 'tool-1', config);
    await shortLimiter.acquireToken('tenant-1', 'tool-1', config);

    await expect(shortLimiter.acquireToken('tenant-1', 'tool-1', config)).rejects.toThrow(
      McpRateLimitError
    );

    shortLimiter.destroy();
  });

  it('should release concurrent tokens and allow new requests', async () => {
    const config = { concurrentRequests: 1 };

    await limiter.acquireToken('tenant-1', 'tool-1', config);
    limiter.releaseToken('tenant-1', 'tool-1');

    await limiter.acquireToken('tenant-1', 'tool-1', config);

    const stats = limiter.getBucketStats('tenant-1', 'tool-1');
    expect(stats?.concurrentCount).toBe(1);
  });

  it('should isolate buckets by tenant and tool', async () => {
    const config = { requestsPerMinute: 2 };

    await limiter.acquireToken('tenant-1', 'tool-a', config);
    await limiter.acquireToken('tenant-1', 'tool-a', config);
    await limiter.acquireToken('tenant-1', 'tool-b', config);
    await limiter.acquireToken('tenant-2', 'tool-a', config);

    expect(limiter.bucketCount).toBe(3);

    const statsA1 = limiter.getBucketStats('tenant-1', 'tool-a');
    const statsB1 = limiter.getBucketStats('tenant-1', 'tool-b');
    const statsA2 = limiter.getBucketStats('tenant-2', 'tool-a');

    expect(statsA1?.minuteCount).toBe(2);
    expect(statsB1?.minuteCount).toBe(1);
    expect(statsA2?.minuteCount).toBe(1);
  });

  it('should return undefined stats for non-existent bucket', () => {
    const stats = limiter.getBucketStats('no-tenant', 'no-tool');
    expect(stats).toBeUndefined();
  });

  it('should throw McpRateLimitError with config on timeout', async () => {
    const shortLimiter = new McpRateLimiter({ timeoutMs: 100 });
    const config = { requestsPerMinute: 1 };

    await shortLimiter.acquireToken('t', 'tool', config);

    try {
      await shortLimiter.acquireToken('t', 'tool', config);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(McpRateLimitError);
      expect((err as McpRateLimitError).config).toEqual(config);
      expect((err as McpRateLimitError).message).toContain('rate limit');
    }

    shortLimiter.destroy();
  });

  it('should handle combined limits (minute + concurrent)', async () => {
    const config = { requestsPerMinute: 10, concurrentRequests: 2 };

    await limiter.acquireToken('t', 'tool', config);
    await limiter.acquireToken('t', 'tool', config);

    const stats = limiter.getBucketStats('t', 'tool');
    expect(stats?.minuteCount).toBe(2);
    expect(stats?.concurrentCount).toBe(2);

    limiter.releaseToken('t', 'tool');

    const afterRelease = limiter.getBucketStats('t', 'tool');
    expect(afterRelease?.concurrentCount).toBe(1);

    await limiter.acquireToken('t', 'tool', config);
    const afterNewAcquire = limiter.getBucketStats('t', 'tool');
    expect(afterNewAcquire?.minuteCount).toBe(3);
    expect(afterNewAcquire?.concurrentCount).toBe(2);
  });

  it('should unblock waiter when concurrent token is released', async () => {
    const config = { concurrentRequests: 1 };

    await limiter.acquireToken('t', 'tool', config);

    const acquired = { done: false };
    const acquirePromise = limiter.acquireToken('t', 'tool', config).then(() => {
      acquired.done = true;
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(acquired.done).toBe(false);

    limiter.releaseToken('t', 'tool');

    await acquirePromise;
    expect(acquired.done).toBe(true);
  });

  it('should clean up buckets on destroy', () => {
    limiter.acquireToken('t', 'tool', { requestsPerMinute: 10 });
    expect(limiter.bucketCount).toBeGreaterThanOrEqual(0);

    limiter.destroy();
    expect(limiter.bucketCount).toBe(0);
  });
});
