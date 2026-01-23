// ============================================================
// src/lib/__tests__/utils.test.ts
// Unit tests for utility functions
// ============================================================

import { describe, expect, it } from 'vitest';

import { formatDate, isDupe, toSlack, truncate } from '../utils';

describe('truncate', () => {
  it('returns original text if under max length', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis if over max length', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('toSlack', () => {
  it('converts markdown links to Slack format', () => {
    expect(toSlack('[text](https://example.com)')).toBe('<https://example.com|text>');
  });

  it('converts bold markdown to Slack format', () => {
    expect(toSlack('**bold**')).toBe('*bold*');
    expect(toSlack('__bold__')).toBe('*bold*');
  });

  it('converts strikethrough', () => {
    expect(toSlack('~~strike~~')).toBe('~strike~');
  });

  it('handles empty string', () => {
    expect(toSlack('')).toBe('');
  });
});

describe('formatDate', () => {
  it('formats ISO date to readable string', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });
});

describe('isDupe', () => {
  it('returns false for first occurrence', () => {
    const id = `test-${Date.now()}`;
    expect(isDupe(id)).toBe(false);
  });

  it('returns true for duplicate within window', () => {
    const id = `test-dupe-${Date.now()}`;
    isDupe(id); // First call
    expect(isDupe(id)).toBe(true); // Second call
  });
});
