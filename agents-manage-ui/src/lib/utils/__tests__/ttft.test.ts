import {
  formatTtft,
  parseTtftSeconds,
  TTFT_FAST_MAX_SECONDS,
  TTFT_MODERATE_MAX_SECONDS,
  ttftQuality,
  ttftQualityClasses,
} from '../ttft';

describe('formatTtft', () => {
  it('renders sub-second values in milliseconds', () => {
    expect(formatTtft(0.812)).toBe('812 ms');
    expect(formatTtft(0.05)).toBe('50 ms');
    expect(formatTtft(0)).toBe('0 ms');
  });

  it('renders >= 1s values in seconds with one decimal', () => {
    expect(formatTtft(1.4)).toBe('1.4 s');
    expect(formatTtft(12.34)).toBe('12.3 s');
    expect(formatTtft(1)).toBe('1.0 s');
  });

  it('renders an em dash for missing or invalid values', () => {
    expect(formatTtft(null)).toBe('—');
    expect(formatTtft(undefined)).toBe('—');
    expect(formatTtft(Number.NaN)).toBe('—');
    expect(formatTtft(-1)).toBe('—');
  });
});

describe('parseTtftSeconds', () => {
  it('returns finite positive values unchanged', () => {
    expect(parseTtftSeconds(8.123)).toBe(8.123);
    expect(parseTtftSeconds(0.000001)).toBe(0.000001);
    expect(parseTtftSeconds(12)).toBe(12);
  });

  it('rejects 0 as absent — the exact "0 ms TTFT" bug (SigNoz returns 0 for missing attrs)', () => {
    expect(parseTtftSeconds(0)).toBeNull();
  });

  it('rejects negative, NaN, and non-finite values', () => {
    expect(parseTtftSeconds(-1)).toBeNull();
    expect(parseTtftSeconds(Number.NaN)).toBeNull();
    expect(parseTtftSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('coerces numeric strings and rejects non-numeric / missing values', () => {
    expect(parseTtftSeconds('8.1')).toBe(8.1);
    expect(parseTtftSeconds('0')).toBeNull();
    expect(parseTtftSeconds('not-a-number')).toBeNull();
    expect(parseTtftSeconds(null)).toBeNull();
    expect(parseTtftSeconds(undefined)).toBeNull();
  });
});

describe('ttftQuality', () => {
  it('classifies absolute bands: fast < 3s, moderate 3-6s, slow > 6s', () => {
    expect(ttftQuality(0.5)).toBe('fast');
    expect(ttftQuality(2.999)).toBe('fast');
    expect(ttftQuality(3)).toBe('moderate');
    expect(ttftQuality(6)).toBe('moderate');
    expect(ttftQuality(6.01)).toBe('slow');
    expect(ttftQuality(8.6)).toBe('slow');
  });

  it('uses the exported threshold constants as the band boundaries', () => {
    expect(ttftQuality(TTFT_FAST_MAX_SECONDS - 0.001)).toBe('fast');
    expect(ttftQuality(TTFT_FAST_MAX_SECONDS)).toBe('moderate');
    expect(ttftQuality(TTFT_MODERATE_MAX_SECONDS)).toBe('moderate');
    expect(ttftQuality(TTFT_MODERATE_MAX_SECONDS + 0.001)).toBe('slow');
  });

  it('returns null for missing or invalid values', () => {
    expect(ttftQuality(null)).toBeNull();
    expect(ttftQuality(undefined)).toBeNull();
    expect(ttftQuality(Number.NaN)).toBeNull();
    expect(ttftQuality(-1)).toBeNull();
  });
});

describe('ttftQualityClasses', () => {
  it('maps each band to its color classes', () => {
    expect(ttftQualityClasses('fast')).toContain('green');
    expect(ttftQualityClasses('moderate')).toContain('yellow');
    expect(ttftQualityClasses('slow')).toContain('red');
  });
});
