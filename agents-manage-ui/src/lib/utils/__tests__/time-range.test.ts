import { getTimeRangeBounds } from '../time-range';

const TIME_RANGES = {
  '24h': { label: 'Last 24 hours', hours: 24 },
  '30d': { label: 'Last 30 days', hours: 24 * 30 },
} as const;

describe('getTimeRangeBounds', () => {
  it('uses local day boundaries for custom ranges', () => {
    const now = new Date(2026, 0, 20, 12, 0, 0, 0).getTime();

    const result = getTimeRangeBounds({
      timeRange: 'custom',
      customRangeKey: 'custom',
      customStartDate: '2026-01-13',
      customEndDate: '2026-01-14',
      timeRanges: TIME_RANGES,
      fallbackTimeRange: '30d',
      now,
    });

    expect(result).toEqual({
      startTime: new Date(2026, 0, 13, 0, 0, 0, 0).getTime(),
      endTime: new Date(2026, 0, 14, 23, 59, 59, 999).getTime(),
    });
  });

  it('clamps custom ranges to now minus 1ms', () => {
    const now = new Date(2026, 0, 14, 12, 0, 0, 0).getTime();

    const result = getTimeRangeBounds({
      timeRange: 'custom',
      customRangeKey: 'custom',
      customStartDate: '2026-01-13',
      customEndDate: '2026-01-20',
      timeRanges: TIME_RANGES,
      fallbackTimeRange: '30d',
      now,
    });

    expect(result).toEqual({
      startTime: new Date(2026, 0, 13, 0, 0, 0, 0).getTime(),
      endTime: now - 1,
    });
  });

  it('falls back to the default preset when custom dates are missing', () => {
    const now = new Date(2026, 0, 14, 12, 0, 0, 0).getTime();

    const result = getTimeRangeBounds({
      timeRange: 'custom',
      customRangeKey: 'custom',
      customStartDate: '2026-01-13',
      customEndDate: '',
      timeRanges: TIME_RANGES,
      fallbackTimeRange: '30d',
      now,
    });

    expect(result).toEqual({
      startTime: now - 1 - 24 * 30 * 60 * 60 * 1000,
      endTime: now - 1,
    });
  });

  it('uses the selected preset range with a clamped end time', () => {
    const now = new Date(2026, 0, 14, 12, 0, 0, 0).getTime();

    const result = getTimeRangeBounds({
      timeRange: '24h',
      customRangeKey: 'custom',
      timeRanges: TIME_RANGES,
      fallbackTimeRange: '30d',
      now,
    });

    expect(result).toEqual({
      startTime: now - 1 - 24 * 60 * 60 * 1000,
      endTime: now - 1,
    });
  });
});
