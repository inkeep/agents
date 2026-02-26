import { describe, expect, it } from 'vitest';
import { parseFreshnessMetadata } from '../freshness';

describe('parseFreshnessMetadata', () => {
  it('parses valid date pair', () => {
    const result = parseFreshnessMetadata('2024-01-01', '2024-06-15');
    expect(result.hasDatePublished).toBe(true);
    expect(result.hasDateModified).toBe(true);
    expect(result.hasSymmetricDates).toBe(true);
    expect(result.hasInvalidDate).toBe(false);
    expect(result.isChronologicallyValid).toBe(true);
    expect(result.datePublished?.value).toBe(new Date('2024-01-01').toISOString());
    expect(result.dateModified?.value).toBe(new Date('2024-06-15').toISOString());
    expect(result.lastModified).toBe(result.dateModified?.value);
  });

  it('handles single datePublished only', () => {
    const result = parseFreshnessMetadata('2024-03-10', undefined);
    expect(result.hasDatePublished).toBe(true);
    expect(result.hasDateModified).toBe(false);
    expect(result.hasSymmetricDates).toBe(false);
    expect(result.hasDateValues).toBe(true);
    expect(result.hasInvalidDate).toBe(false);
    expect(result.datePublished).toBeDefined();
    expect(result.dateModified).toBeUndefined();
    expect(result.lastModified).toBe(result.datePublished?.value);
  });

  it('handles single dateModified only', () => {
    const result = parseFreshnessMetadata(undefined, '2024-05-20');
    expect(result.hasDatePublished).toBe(false);
    expect(result.hasDateModified).toBe(true);
    expect(result.hasSymmetricDates).toBe(false);
    expect(result.hasInvalidDate).toBe(false);
    expect(result.dateModified).toBeDefined();
    expect(result.lastModified).toBe(result.dateModified?.value);
  });

  it('handles both dates absent', () => {
    const result = parseFreshnessMetadata(undefined, undefined);
    expect(result.hasDatePublished).toBe(false);
    expect(result.hasDateModified).toBe(false);
    expect(result.hasSymmetricDates).toBe(true);
    expect(result.hasDateValues).toBe(false);
    expect(result.hasInvalidDate).toBe(false);
    expect(result.isChronologicallyValid).toBe(true);
    expect(result.lastModified).toBeUndefined();
  });

  it('detects invalid datePublished (regex fails)', () => {
    const result = parseFreshnessMetadata('not-a-date', '2024-01-01');
    expect(result.hasDatePublished).toBe(true);
    expect(result.hasInvalidDate).toBe(true);
    expect(result.datePublished).toBeUndefined();
  });

  it('detects invalid dateModified (regex fails)', () => {
    const result = parseFreshnessMetadata('2024-01-01', 'invalid');
    expect(result.hasDateModified).toBe(true);
    expect(result.hasInvalidDate).toBe(true);
    expect(result.dateModified).toBeUndefined();
  });

  it('detects chronologically invalid dates (modified before published)', () => {
    const result = parseFreshnessMetadata('2024-06-15', '2024-01-01');
    expect(result.isChronologicallyValid).toBe(false);
  });

  it('handles ISO datetime with timezone', () => {
    const result = parseFreshnessMetadata('2024-03-10T12:00:00Z', '2024-06-15T18:30:00+05:00');
    expect(result.hasInvalidDate).toBe(false);
    expect(result.datePublished).toBeDefined();
    expect(result.dateModified).toBeDefined();
  });

  it('handles empty strings as absent', () => {
    const result = parseFreshnessMetadata('', '');
    expect(result.hasDatePublished).toBe(false);
    expect(result.hasDateModified).toBe(false);
    expect(result.hasInvalidDate).toBe(false);
  });

  it('handles whitespace-only strings as absent', () => {
    const result = parseFreshnessMetadata('   ', '   ');
    expect(result.hasDatePublished).toBe(false);
    expect(result.hasDateModified).toBe(false);
    expect(result.hasInvalidDate).toBe(false);
  });
});
