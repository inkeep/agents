import { formatDate, formatDateAgo } from '../format-date';

// Mock console.warn to avoid noise in test output
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('formatDate', () => {
  it('should format valid date strings correctly', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toBe('Jan 15, 2024');
  });

  it('should handle invalid date strings gracefully', () => {
    const result = formatDate('invalid-date');
    expect(result).toBe('Invalid date');
  });

  it('should handle empty string', () => {
    const result = formatDate('');
    expect(result).toBe('Invalid date');
  });

  it('should handle null-like inputs', () => {
    const result = formatDate('null');
    expect(result).toBe('Invalid date');
  });
});

describe('formatDateAgo', () => {
  beforeEach(() => {
    // Mock the current time to make tests deterministic
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
      // Since current mock time is 2024-01-15, we need to use 2023 for dates older than 30 days
      // Let's change this to test a same year scenario by using a date from later in 2024 as current time
      vi.setSystemTime(new Date('2024-12-15T12:00:00Z'));
      const twoMonthsAgo = new Date('2024-09-15T12:00:00Z').toISOString();
      expect(formatDateAgo(twoMonthsAgo)).toBe('Sep 15');
      // Reset to original mock time for other tests
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    it('should return formatted date with year for dates in different year', () => {
      const lastYear = new Date('2023-01-15T12:00:00Z').toISOString();
      expect(formatDateAgo(lastYear)).toBe('Jan 15, 2023');
    });
  });

  describe('edge cases', () => {
    it('should handle future dates', () => {
      const futureDate = new Date('2024-01-16T12:00:00Z').toISOString();
      expect(formatDateAgo(futureDate)).toBe('In the future');
    });

    it('should handle invalid date strings', () => {
      expect(formatDateAgo('invalid-date')).toBe('Invalid date');
      // console.warn is not called for invalid dates since they're caught by NaN check, not catch block
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
      // The actual result depends on timezone - let's be more flexible
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
