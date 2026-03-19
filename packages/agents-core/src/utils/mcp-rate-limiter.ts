import type { McpRateLimitConfig } from '../validation/schemas';

const DEFAULT_TIMEOUT_MS = 30_000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const BUCKET_IDLE_TTL_MS = 10 * 60 * 1000;

class TokenBucket {
  private minuteTimestamps: number[] = [];
  private hourTimestamps: number[] = [];
  private concurrentCount = 0;
  private waiters: Array<() => void> = [];
  lastUsed: number;

  constructor(private config: McpRateLimitConfig) {
    this.lastUsed = Date.now();
  }

  async acquire(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (true) {
      const now = Date.now();
      if (now >= deadline) {
        throw new McpRateLimitError(
          'MCP rate limit timeout: waited too long for available capacity',
          this.config
        );
      }

      this.pruneTimestamps(now);

      const minuteBlocked =
        this.config.requestsPerMinute !== undefined &&
        this.minuteTimestamps.length >= this.config.requestsPerMinute;

      const hourBlocked =
        this.config.requestsPerHour !== undefined &&
        this.hourTimestamps.length >= this.config.requestsPerHour;

      const concurrentBlocked =
        this.config.concurrentRequests !== undefined &&
        this.concurrentCount >= this.config.concurrentRequests;

      if (!minuteBlocked && !hourBlocked && !concurrentBlocked) {
        this.minuteTimestamps.push(now);
        this.hourTimestamps.push(now);
        if (this.config.concurrentRequests !== undefined) {
          this.concurrentCount++;
        }
        this.lastUsed = now;
        return;
      }

      let waitMs = Math.min(100, deadline - now);

      if (minuteBlocked && this.minuteTimestamps.length > 0) {
        const oldest = this.minuteTimestamps[0];
        const expiresIn = oldest + 60_000 - now;
        if (expiresIn > 0) waitMs = Math.min(waitMs, expiresIn + 10);
      }

      if (hourBlocked && this.hourTimestamps.length > 0) {
        const oldest = this.hourTimestamps[0];
        const expiresIn = oldest + 3_600_000 - now;
        if (expiresIn > 0) waitMs = Math.min(waitMs, expiresIn + 10);
      }

      waitMs = Math.max(10, Math.min(waitMs, deadline - now));

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          const idx = this.waiters.indexOf(resolve);
          if (idx >= 0) this.waiters.splice(idx, 1);
          resolve();
        }, waitMs);

        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  release(): void {
    if (this.concurrentCount > 0) {
      this.concurrentCount--;
    }
    this.lastUsed = Date.now();
    const waiter = this.waiters.shift();
    if (waiter) waiter();
  }

  private pruneTimestamps(now: number): void {
    const minuteCutoff = now - 60_000;
    while (this.minuteTimestamps.length > 0 && this.minuteTimestamps[0] <= minuteCutoff) {
      this.minuteTimestamps.shift();
    }

    const hourCutoff = now - 3_600_000;
    while (this.hourTimestamps.length > 0 && this.hourTimestamps[0] <= hourCutoff) {
      this.hourTimestamps.shift();
    }
  }

  get stats(): {
    minuteCount: number;
    hourCount: number;
    concurrentCount: number;
    waitingCount: number;
  } {
    this.pruneTimestamps(Date.now());
    return {
      minuteCount: this.minuteTimestamps.length,
      hourCount: this.hourTimestamps.length,
      concurrentCount: this.concurrentCount,
      waitingCount: this.waiters.length,
    };
  }
}

export class McpRateLimitError extends Error {
  constructor(
    message: string,
    public readonly config: McpRateLimitConfig
  ) {
    super(message);
    this.name = 'McpRateLimitError';
  }
}

export class McpRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private timeoutMs: number;

  constructor(opts?: { timeoutMs?: number }) {
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  async acquireToken(tenantId: string, toolId: string, config: McpRateLimitConfig): Promise<void> {
    const key = `${tenantId}:${toolId}`;
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = new TokenBucket(config);
      this.buckets.set(key, bucket);
    }

    await bucket.acquire(this.timeoutMs);
  }

  releaseToken(tenantId: string, toolId: string): void {
    const key = `${tenantId}:${toolId}`;
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.release();
    }
  }

  getBucketStats(
    tenantId: string,
    toolId: string
  ):
    | { minuteCount: number; hourCount: number; concurrentCount: number; waitingCount: number }
    | undefined {
    const key = `${tenantId}:${toolId}`;
    return this.buckets.get(key)?.stats;
  }

  get bucketCount(): number {
    return this.buckets.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastUsed > BUCKET_IDLE_TTL_MS) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }
}
