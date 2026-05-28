import { describe, expect, it } from 'vitest';
import { bucketByCacheParticipation } from '../cost-dashboard';

interface SummaryFixture {
  groupKey: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  totalEstimatedCostUsd?: number;
  eventCount?: number;
  totalCacheReadTokens?: number;
  totalCacheCreationTokens?: number;
}

const row = (fixture: SummaryFixture) => ({
  groupKey: fixture.groupKey,
  totalInputTokens: fixture.totalInputTokens ?? 0,
  totalOutputTokens: fixture.totalOutputTokens ?? 0,
  totalTokens: fixture.totalTokens ?? 0,
  totalEstimatedCostUsd: fixture.totalEstimatedCostUsd ?? 0,
  eventCount: fixture.eventCount ?? 0,
  totalCacheReadTokens: fixture.totalCacheReadTokens ?? 0,
  totalCacheCreationTokens: fixture.totalCacheCreationTokens ?? 0,
});

describe('bucketByCacheParticipation', () => {
  it('returns an empty array when given no input rows', () => {
    expect(bucketByCacheParticipation([])).toEqual([]);
  });

  it('classifies rows with cacheReadTokens > 0 into the Cached bucket', () => {
    const result = bucketByCacheParticipation([
      row({
        groupKey: 'agent_generation',
        totalTokens: 10_000,
        totalEstimatedCostUsd: 0.5,
        eventCount: 4,
        totalCacheReadTokens: 8000,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.groupKey).toBe('Cached');
    expect(result[0]?.totalCacheReadTokens).toBe(8000);
    expect(result[0]?.eventCount).toBe(4);
    expect(result[0]?.totalEstimatedCostUsd).toBe(0.5);
  });

  it('classifies rows with cacheCreationTokens > 0 and no read into the Cache writes bucket', () => {
    const result = bucketByCacheParticipation([
      row({
        groupKey: 'agent_generation',
        totalTokens: 10_000,
        totalEstimatedCostUsd: 0.5,
        eventCount: 1,
        totalCacheCreationTokens: 8000,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.groupKey).toBe('Cache writes');
    expect(result[0]?.totalCacheCreationTokens).toBe(8000);
  });

  it('classifies rows with no cache participation into the Uncached bucket', () => {
    const result = bucketByCacheParticipation([
      row({
        groupKey: 'distillation',
        totalTokens: 500,
        totalEstimatedCostUsd: 0.01,
        eventCount: 2,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.groupKey).toBe('Uncached');
    expect(result[0]?.eventCount).toBe(2);
  });

  it('Cached bucket wins when both read and creation are non-zero', () => {
    const result = bucketByCacheParticipation([
      row({
        groupKey: 'agent_generation',
        totalCacheReadTokens: 5000,
        totalCacheCreationTokens: 3000,
        eventCount: 3,
        totalEstimatedCostUsd: 0.3,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.groupKey).toBe('Cached');
    expect(result[0]?.totalCacheReadTokens).toBe(5000);
    expect(result[0]?.totalCacheCreationTokens).toBe(3000);
  });

  it('sums multiple rows into the same bucket and preserves CACHE_PARTICIPATION_ORDER', () => {
    const result = bucketByCacheParticipation([
      row({
        groupKey: 'agent_generation',
        totalTokens: 10_000,
        totalEstimatedCostUsd: 0.5,
        eventCount: 4,
        totalInputTokens: 8000,
        totalOutputTokens: 2000,
        totalCacheReadTokens: 6000,
      }),
      row({
        groupKey: 'distillation',
        totalTokens: 2000,
        totalEstimatedCostUsd: 0.05,
        eventCount: 2,
        totalInputTokens: 1500,
        totalOutputTokens: 500,
      }),
      row({
        groupKey: 'artifact_metadata',
        totalTokens: 500,
        totalEstimatedCostUsd: 0.01,
        eventCount: 1,
        totalInputTokens: 400,
        totalOutputTokens: 100,
        totalCacheCreationTokens: 200,
      }),
      row({
        groupKey: 'status_update',
        totalTokens: 1000,
        totalEstimatedCostUsd: 0.02,
        eventCount: 5,
        totalInputTokens: 800,
        totalOutputTokens: 200,
        totalCacheReadTokens: 1000,
      }),
    ]);

    expect(result.map((r) => r.groupKey)).toEqual(['Cached', 'Cache writes', 'Uncached']);

    const cached = result.find((r) => r.groupKey === 'Cached');
    expect(cached?.eventCount).toBe(9);
    expect(cached?.totalTokens).toBe(11_000);
    expect(cached?.totalInputTokens).toBe(8800);
    expect(cached?.totalOutputTokens).toBe(2200);
    expect(cached?.totalEstimatedCostUsd).toBeCloseTo(0.52);
    expect(cached?.totalCacheReadTokens).toBe(7000);

    const writes = result.find((r) => r.groupKey === 'Cache writes');
    expect(writes?.eventCount).toBe(1);
    expect(writes?.totalCacheCreationTokens).toBe(200);

    const uncached = result.find((r) => r.groupKey === 'Uncached');
    expect(uncached?.eventCount).toBe(2);
    expect(uncached?.totalTokens).toBe(2000);
  });

  it('drops buckets with zero events so the table only shows populated states', () => {
    const result = bucketByCacheParticipation([
      row({
        groupKey: 'agent_generation',
        eventCount: 3,
        totalCacheReadTokens: 6000,
      }),
    ]);
    expect(result.map((r) => r.groupKey)).toEqual(['Cached']);
  });

  it('is stable across reorderings of the input', () => {
    const inputA = [
      row({ groupKey: 'a', eventCount: 1, totalCacheReadTokens: 100 }),
      row({ groupKey: 'b', eventCount: 1 }),
    ];
    const inputB = [
      row({ groupKey: 'b', eventCount: 1 }),
      row({ groupKey: 'a', eventCount: 1, totalCacheReadTokens: 100 }),
    ];
    const resultA = bucketByCacheParticipation(inputA);
    const resultB = bucketByCacheParticipation(inputB);
    expect(resultA).toEqual(resultB);
    expect(resultA.map((r) => r.groupKey)).toEqual(['Cached', 'Uncached']);
  });
});
