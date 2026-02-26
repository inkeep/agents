import { formatDate, formatDateAgo, formatDateTime, formatDateTimeTable } from '../format-date';

// Mock console.warn and console.error to avoid noise in test output
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('formatDate', () => {
  describe('ISO 8601 format', () => {
    it('should format valid ISO date strings correctly', () => {
      expect(formatDate('2024-01-15T10:30:00Z')).toBe('Jan 15, 2024');
    });

    it('should format ISO date with milliseconds', () => {
      expect(formatDate('2024-01-15T10:30:00.123Z')).toBe('Jan 15, 2024');
    });

    it('should format ISO date with full timezone offset', () => {
      expect(formatDate('2024-01-15T10:30:00+00:00')).toBe('Jan 15, 2024');
    });
  });

  describe('PostgreSQL/Doltgres timestamp formats', () => {
    it('should handle timestamp without fractional seconds', () => {
      expect(formatDate('2025-11-07 21:48:24')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with 3 fractional digits (milliseconds)', () => {
      expect(formatDate('2025-11-07 21:48:24.858')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with 6 fractional digits (microseconds)', () => {
      expect(formatDate('2025-11-07 21:48:24.858000')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with 6 non-zero fractional digits', () => {
      expect(formatDate('2025-11-07 21:48:24.858123')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with 9 fractional digits (nanoseconds)', () => {
      expect(formatDate('2025-11-07 21:48:24.858123456')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with +00 timezone offset', () => {
      expect(formatDate('2025-11-07 21:48:24.858+00')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with +00:00 timezone offset', () => {
      expect(formatDate('2025-11-07 21:48:24.858+00:00')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with microseconds and +00 offset', () => {
      expect(formatDate('2025-11-07 21:48:24.858123+00')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp without fractional seconds but with timezone', () => {
      expect(formatDate('2025-11-07 21:48:24+00')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with non-UTC timezone offset', () => {
      expect(formatDate('2025-11-07 21:48:24.858+05:30')).toBe('Nov 7, 2025');
    });

    it('should handle timestamp with negative timezone offset', () => {
      expect(formatDate('2025-11-07 21:48:24.858-05')).toBe('Nov 8, 2025');
    });

    it('should handle timestamp with compact timezone offset (+0000)', () => {
      expect(formatDate('2025-11-07 21:48:24.858+0000')).toBe('Nov 7, 2025');
    });
  });

  describe('ISO with non-standard timezone (T separator + short tz)', () => {
    it('should handle T-separated timestamp with +00 timezone', () => {
      expect(formatDate('2025-11-07T21:48:24.858+00')).toBe('Nov 7, 2025');
    });

    it('should handle T-separated timestamp with microseconds and +00', () => {
      expect(formatDate('2025-11-07T21:48:24.858000+00')).toBe('Nov 7, 2025');
    });

    it('should handle T-separated timestamp without Z', () => {
      expect(formatDate('2025-11-07T21:48:24.858')).not.toBe('Invalid date');
    });
  });

  describe('whitespace handling', () => {
    it('should handle leading/trailing whitespace', () => {
      expect(formatDate('  2024-01-15T10:30:00Z  ')).toBe('Jan 15, 2024');
    });

    it('should handle timestamp with trailing whitespace', () => {
      expect(formatDate('2025-11-07 21:48:24.858 ')).toBe('Nov 7, 2025');
    });
  });

  describe('invalid inputs', () => {
    it('should return Invalid date for non-date strings', () => {
      expect(formatDate('invalid-date')).toBe('Invalid date');
    });

    it('should return Invalid date for empty string', () => {
      expect(formatDate('')).toBe('Invalid date');
    });

    it('should return Invalid date for null-like inputs', () => {
      expect(formatDate('null')).toBe('Invalid date');
    });

    it('should return Invalid date for undefined-like inputs', () => {
      expect(formatDate('undefined')).toBe('Invalid date');
    });
  });

  describe('local timezone option', () => {
    it('should format in UTC by default', () => {
      expect(formatDate('2024-01-15T23:30:00Z')).toBe('Jan 15, 2024');
    });

    it('should accept local option without error', () => {
      expect(formatDate('2024-01-15T10:30:00Z', { local: true })).not.toBe('Invalid date');
    });
  });
});

describe('formatDateTime', () => {
  it('should format ISO date with time', () => {
    expect(formatDateTime('2024-08-28T17:42:30Z')).toBe('Aug 28, 2024, 5:42:30 PM');
  });

  it('should handle PostgreSQL timestamp with microseconds', () => {
    expect(formatDateTime('2024-08-28 17:42:30.123456')).toBe('Aug 28, 2024, 5:42:30 PM');
  });

  it('should return Invalid date for invalid input', () => {
    expect(formatDateTime('not-a-date')).toBe('Invalid date');
  });
});

describe('formatDateTimeTable', () => {
  it('should format ISO date with time (no seconds)', () => {
    expect(formatDateTimeTable('2024-08-28T17:42:30Z')).toBe('Aug 28, 2024, 5:42 PM');
  });

  it('should handle PostgreSQL timestamp with microseconds', () => {
    expect(formatDateTimeTable('2024-08-28 17:42:30.123456')).toBe('Aug 28, 2024, 5:42 PM');
  });

  it('should return Invalid date for invalid input', () => {
    expect(formatDateTimeTable('not-a-date')).toBe('Invalid date');
  });
});

describe('formatDateAgo', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  describe('valid dates', () => {
    it('should return "just now" for dates less than 1 minute ago', () => {
      const thirtySecondsAgo = new Date('2024-01-15T11:59:30Z').toISOString();
      expect(formatDateAgo(thirtySecondsAgo)).toBe('just now');
    });

    it('should return minutes for dates less than 1 hour ago', () => {
      const thirtyMinutesAgo = new Date('2024-01-15T11:30:00Z').toISOString();
      expect(formatDateAgo(thirtyMinutesAgo)).toBe('30m ago');
    });

    it('should return hours for dates less than 24 hours ago', () => {
      const threeHoursAgo = new Date('2024-01-15T09:00:00Z').toISOString();
      expect(formatDateAgo(threeHoursAgo)).toBe('3h ago');
    });

    it('should return days for dates less than 7 days ago', () => {
      const threeDaysAgo = new Date('2024-01-12T12:00:00Z').toISOString();
      expect(formatDateAgo(threeDaysAgo)).toBe('3d ago');
    });

    it('should return weeks for dates less than 30 days ago', () => {
      const twoWeeksAgo = new Date('2024-01-01T12:00:00Z').toISOString();
      expect(formatDateAgo(twoWeeksAgo)).toBe('2w ago');
    });

    it('should return formatted date for dates more than 30 days ago (same year)', () => {
      vi.setSystemTime(new Date('2024-12-15T12:00:00Z'));
      const twoMonthsAgo = new Date('2024-09-15T12:00:00Z').toISOString();
      expect(formatDateAgo(twoMonthsAgo)).toBe('Sep 15');
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    it('should return formatted date with year for dates in different year', () => {
      const lastYear = new Date('2023-01-15T12:00:00Z').toISOString();
      expect(formatDateAgo(lastYear)).toBe('Jan 15, 2023');
    });
  });

  describe('PostgreSQL/Doltgres timestamp formats', () => {
    it('should handle PostgreSQL timestamp with microseconds', () => {
      expect(formatDateAgo('2024-01-15 09:00:00.000000')).toBe('3h ago');
    });

    it('should handle PostgreSQL timestamp with 3 fractional digits', () => {
      expect(formatDateAgo('2024-01-15 09:00:00.000')).toBe('3h ago');
    });

    it('should handle PostgreSQL timestamp without fractional seconds', () => {
      expect(formatDateAgo('2024-01-15 09:00:00')).toBe('3h ago');
    });

    it('should handle PostgreSQL timestamp with timezone offset', () => {
      expect(formatDateAgo('2024-01-15 09:00:00.000+00')).toBe('3h ago');
    });
  });

  describe('edge cases', () => {
    it('should handle future dates', () => {
      const futureDate = new Date('2024-01-16T12:00:00Z').toISOString();
      expect(formatDateAgo(futureDate)).toBe('In the future');
    });

    it('should handle invalid date strings', () => {
      expect(formatDateAgo('invalid-date')).toBe('Invalid date');
    });

    it('should handle empty string', () => {
      expect(formatDateAgo('')).toBe('Invalid date');
    });

    it('should handle null string', () => {
      expect(formatDateAgo('null')).toBe('Invalid date');
    });

    it('should handle undefined string', () => {
      expect(formatDateAgo('undefined')).toBe('Invalid date');
    });

    it('should handle malformed ISO strings', () => {
      expect(formatDateAgo('2024-13-45T25:70:80Z')).toBe('Invalid date');
    });

    it('should handle very large timestamps', () => {
      const veryOldDate = new Date('1970-01-01T00:00:00Z').toISOString();
      const result = formatDateAgo(veryOldDate);
      expect(result).toMatch(/^(Dec 31, 1969|Jan 1, 1970)$/);
    });
  });

  describe('boundary conditions', () => {
    it('should handle exactly 1 minute ago', () => {
      const oneMinuteAgo = new Date('2024-01-15T11:59:00Z').toISOString();
      expect(formatDateAgo(oneMinuteAgo)).toBe('1m ago');
    });

    it('should handle exactly 1 hour ago', () => {
      const oneHourAgo = new Date('2024-01-15T11:00:00Z').toISOString();
      expect(formatDateAgo(oneHourAgo)).toBe('1h ago');
    });

    it('should handle exactly 1 day ago', () => {
      const oneDayAgo = new Date('2024-01-14T12:00:00Z').toISOString();
      expect(formatDateAgo(oneDayAgo)).toBe('1d ago');
    });

    it('should handle exactly 1 week ago', () => {
      const oneWeekAgo = new Date('2024-01-08T12:00:00Z').toISOString();
      expect(formatDateAgo(oneWeekAgo)).toBe('1w ago');
    });
  });
});
