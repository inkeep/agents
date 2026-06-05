import { describe, expect, it, vi } from 'vitest';
import {
  isAutoMintIdentity,
  parseInkeepJsonHeader,
  stripIdentificationType,
} from '../user-properties';

describe('parseInkeepJsonHeader', () => {
  it('returns undefined for undefined / empty / whitespace-only', () => {
    expect(parseInkeepJsonHeader(undefined)).toBeUndefined();
    expect(parseInkeepJsonHeader('')).toBeUndefined();
  });

  it('parses a valid JSON object', () => {
    expect(parseInkeepJsonHeader('{"id":"u1","plan":"pro"}')).toEqual({
      id: 'u1',
      plan: 'pro',
    });
  });

  it('returns undefined for JSON arrays', () => {
    expect(parseInkeepJsonHeader('[1,2,3]')).toBeUndefined();
  });

  it('returns undefined for JSON primitives (string, number, boolean, null)', () => {
    expect(parseInkeepJsonHeader('"hello"')).toBeUndefined();
    expect(parseInkeepJsonHeader('42')).toBeUndefined();
    expect(parseInkeepJsonHeader('true')).toBeUndefined();
    expect(parseInkeepJsonHeader('null')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(parseInkeepJsonHeader('{not-json}')).toBeUndefined();
    expect(parseInkeepJsonHeader('{"unterminated"')).toBeUndefined();
  });

  it('logs a warn for non-empty malformed JSON when a logger is provided', () => {
    const logger = { warn: vi.fn() };
    parseInkeepJsonHeader('{bad}', { headerName: 'x-test', logger });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ headerName: 'x-test', error: expect.any(String) }),
      expect.stringContaining('Failed to parse')
    );
  });

  it('logs a warn for non-empty wrong-shape JSON when a logger is provided', () => {
    const logger = { warn: vi.fn() };
    parseInkeepJsonHeader('[1,2,3]', { headerName: 'x-test', logger });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ headerName: 'x-test', valueType: 'array' }),
      expect.stringContaining('not a plain object')
    );
  });

  it('does not log when header is empty (silent on absence)', () => {
    const logger = { warn: vi.fn() };
    parseInkeepJsonHeader(undefined, { headerName: 'x-test', logger });
    parseInkeepJsonHeader('', { headerName: 'x-test', logger });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('isAutoMintIdentity', () => {
  it('returns false for undefined', () => {
    expect(isAutoMintIdentity(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isAutoMintIdentity({})).toBe(false);
  });

  it('returns true for identificationType=ANONYMOUS', () => {
    expect(isAutoMintIdentity({ id: 'x', identificationType: 'ANONYMOUS' })).toBe(true);
  });

  it('returns true for identificationType=COOKIED', () => {
    expect(isAutoMintIdentity({ id: 'x', identificationType: 'COOKIED' })).toBe(true);
  });

  it('returns false for identificationType=ID_PROVIDED', () => {
    expect(isAutoMintIdentity({ id: 'x', identificationType: 'ID_PROVIDED' })).toBe(false);
  });

  it('returns false for unknown identificationType values (forward-compatible)', () => {
    expect(isAutoMintIdentity({ id: 'x', identificationType: 'TOKEN' })).toBe(false);
    expect(isAutoMintIdentity({ id: 'x', identificationType: 'WHATEVER' })).toBe(false);
  });

  it('returns false when identificationType is missing entirely', () => {
    expect(isAutoMintIdentity({ id: 'x', plan: 'pro' })).toBe(false);
    expect(isAutoMintIdentity({ userId: 'x' })).toBe(false);
  });
});

describe('stripIdentificationType', () => {
  it('returns undefined for undefined', () => {
    expect(stripIdentificationType(undefined)).toBeUndefined();
  });

  it('returns the value unchanged when identificationType is absent', () => {
    expect(stripIdentificationType({ id: 'x', plan: 'pro' })).toEqual({ id: 'x', plan: 'pro' });
  });

  it('removes only identificationType, preserving all other keys', () => {
    expect(
      stripIdentificationType({
        id: 'x',
        identificationType: 'ID_PROVIDED',
        plan: 'pro',
        email: 'a@b.com',
      })
    ).toEqual({ id: 'x', plan: 'pro', email: 'a@b.com' });
  });

  it('returns an empty object when identificationType was the only key', () => {
    expect(stripIdentificationType({ identificationType: 'ANONYMOUS' })).toEqual({});
  });

  it('does not mutate the input object', () => {
    const input = { id: 'x', identificationType: 'ID_PROVIDED' as const };
    stripIdentificationType(input);
    expect(input).toEqual({ id: 'x', identificationType: 'ID_PROVIDED' });
  });
});
