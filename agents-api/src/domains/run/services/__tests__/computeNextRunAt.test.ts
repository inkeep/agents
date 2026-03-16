import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeNextRunAt } from '../computeNextRunAt';

describe('computeNextRunAt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns runAt for one-time triggers (no cronExpression)', () => {
    const result = computeNextRunAt({
      runAt: '2026-06-15T12:00:00.000Z',
      cronExpression: null,
    });

    expect(result).toBe('2026-06-15T12:00:00.000Z');
  });

  it('returns null when neither cronExpression nor runAt provided', () => {
    const result = computeNextRunAt({
      cronExpression: null,
      runAt: null,
    });

    expect(result).toBeNull();
  });

  it('returns null for empty params', () => {
    const result = computeNextRunAt({});

    expect(result).toBeNull();
  });

  it('computes next cron time from lastScheduledFor', () => {
    const result = computeNextRunAt({
      cronExpression: '* * * * *',
      lastScheduledFor: '2026-03-13T10:00:00.000Z',
    });

    expect(result).toBe('2026-03-13T10:01:00.000Z');
  });

  it('uses current time when lastScheduledFor is null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T10:30:00.000Z'));

    const result = computeNextRunAt({
      cronExpression: '* * * * *',
      lastScheduledFor: null,
    });

    expect(result).toBe('2026-03-13T10:31:00.000Z');
  });

  it('cron takes precedence when both cronExpression and runAt are present', () => {
    const result = computeNextRunAt({
      cronExpression: '0 9 * * *',
      runAt: '2026-06-15T12:00:00.000Z',
      lastScheduledFor: '2026-03-13T09:00:00.000Z',
    });

    expect(result).toBe('2026-03-14T09:00:00.000Z');
  });

  it('handles hourly cron expression', () => {
    const result = computeNextRunAt({
      cronExpression: '0 * * * *',
      lastScheduledFor: '2026-03-13T10:00:00.000Z',
    });

    expect(result).toBe('2026-03-13T11:00:00.000Z');
  });

  it('handles daily cron expression', () => {
    const result = computeNextRunAt({
      cronExpression: '30 14 * * *',
      lastScheduledFor: '2026-03-13T14:30:00.000Z',
    });

    expect(result).toBe('2026-03-14T14:30:00.000Z');
  });

  it('handles timezone correctly', () => {
    const result = computeNextRunAt({
      cronExpression: '0 9 * * *',
      cronTimezone: 'America/New_York',
      lastScheduledFor: '2026-03-13T13:00:00.000Z',
    });

    expect(result).toBeDefined();
    const nextDate = new Date(result!);
    expect(nextDate.getTime()).toBeGreaterThan(new Date('2026-03-13T13:00:00.000Z').getTime());
  });

  it('defaults to UTC when cronTimezone is null', () => {
    const result = computeNextRunAt({
      cronExpression: '0 9 * * *',
      cronTimezone: null,
      lastScheduledFor: '2026-03-13T09:00:00.000Z',
    });

    expect(result).toBe('2026-03-14T09:00:00.000Z');
  });

  it('handles DST spring-forward transition', () => {
    const result = computeNextRunAt({
      cronExpression: '30 2 * * *',
      cronTimezone: 'America/New_York',
      lastScheduledFor: '2026-03-07T07:30:00.000Z',
    });

    expect(result).toBeDefined();
    const nextDate = new Date(result!);
    expect(nextDate.getTime()).toBeGreaterThan(new Date('2026-03-07T07:30:00.000Z').getTime());
  });

  it('handles DST fall-back transition', () => {
    const result = computeNextRunAt({
      cronExpression: '30 1 * * *',
      cronTimezone: 'America/New_York',
      lastScheduledFor: '2026-10-31T05:30:00.000Z',
    });

    expect(result).toBeDefined();
    const nextDate = new Date(result!);
    expect(nextDate.getTime()).toBeGreaterThan(new Date('2026-10-31T05:30:00.000Z').getTime());
  });

  it('advances correctly from a lastScheduledFor far in the past', () => {
    const result = computeNextRunAt({
      cronExpression: '* * * * *',
      lastScheduledFor: '2020-01-01T00:00:00.000Z',
    });

    expect(result).toBe('2020-01-01T00:01:00.000Z');
  });
});
