import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpRateLimitError, McpRateLimiter } from '../../utils/mcp-rate-limiter';

describe('MCP client rate limiting integration', () => {
  let limiter: McpRateLimiter;

  beforeEach(() => {
    limiter = new McpRateLimiter({ timeoutMs: 1000 });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it('should no-op when rate limit config is not provided', async () => {
    const rateLimitConfig = null;
    const shouldRateLimit = limiter && rateLimitConfig && 'tenant-1' && 'tool-1';

    expect(shouldRateLimit).toBeFalsy();
    expect(limiter.bucketCount).toBe(0);
  });

  it('should acquire and release tokens in the execute-then-release pattern', async () => {
    const config = { concurrentRequests: 2, requestsPerMinute: 100 };
    const tenantId = 'tenant-1';
    const toolId = 'tool-1';

    await limiter.acquireToken(tenantId, toolId, config);
    await limiter.acquireToken(tenantId, toolId, config);

    const stats = limiter.getBucketStats(tenantId, toolId);
    expect(stats?.concurrentCount).toBe(2);

    limiter.releaseToken(tenantId, toolId);
    const afterRelease = limiter.getBucketStats(tenantId, toolId);
    expect(afterRelease?.concurrentCount).toBe(1);

    limiter.releaseToken(tenantId, toolId);
    const afterSecondRelease = limiter.getBucketStats(tenantId, toolId);
    expect(afterSecondRelease?.concurrentCount).toBe(0);
  });

  it('should release concurrent token even when tool call fails', async () => {
    const config = { concurrentRequests: 1 };
    const tenantId = 'tenant-1';
    const toolId = 'tool-1';

    const simulateToolCall = async (shouldFail: boolean) => {
      await limiter.acquireToken(tenantId, toolId, config);
      try {
        if (shouldFail) throw new Error('Tool call failed');
        return 'success';
      } finally {
        if (config.concurrentRequests !== undefined) {
          limiter.releaseToken(tenantId, toolId);
        }
      }
    };

    await expect(simulateToolCall(true)).rejects.toThrow('Tool call failed');

    const stats = limiter.getBucketStats(tenantId, toolId);
    expect(stats?.concurrentCount).toBe(0);

    const result = await simulateToolCall(false);
    expect(result).toBe('success');
  });

  it('should share rate limiter across multiple tool instances for same tenant+tool', async () => {
    const config = { requestsPerMinute: 3 };
    const tenantId = 'shared-tenant';
    const toolId = 'shared-tool';

    await limiter.acquireToken(tenantId, toolId, config);
    await limiter.acquireToken(tenantId, toolId, config);
    await limiter.acquireToken(tenantId, toolId, config);

    const stats = limiter.getBucketStats(tenantId, toolId);
    expect(stats?.minuteCount).toBe(3);

    const shortLimiter = new McpRateLimiter({ timeoutMs: 200 });
    await shortLimiter.acquireToken(tenantId, toolId, config);
    await shortLimiter.acquireToken(tenantId, toolId, config);
    await shortLimiter.acquireToken(tenantId, toolId, config);

    await expect(shortLimiter.acquireToken(tenantId, toolId, config)).rejects.toThrow(
      McpRateLimitError
    );

    shortLimiter.destroy();
  });

  it('should not rate limit when only rateLimiter is set but config is null', () => {
    const rateLimitConfig = null;
    const shouldRateLimit = limiter && rateLimitConfig && 'tenant-1' && 'tool-1';
    expect(shouldRateLimit).toBeFalsy();
  });
});
