import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETRYABLE_CODES,
  getPostgresErrorCode,
  isRetryableError,
  RETRYABLE_NODE_ERROR_CODES,
  RETRYABLE_POOL_MESSAGES,
} from '../retryable-errors';

describe('getPostgresErrorCode', () => {
  it('extracts SQLSTATE from DrizzleQueryError shape (.cause.code)', () => {
    const error = { message: 'Query failed', cause: { code: '40001' } };
    expect(getPostgresErrorCode(error)).toBe('40001');
  });

  it('extracts SQLSTATE from raw DatabaseError shape (.code)', () => {
    const error = { code: '23505', message: 'unique violation' };
    expect(getPostgresErrorCode(error)).toBe('23505');
  });

  it('prefers .cause.code over .code when both are SQLSTATE', () => {
    const error = { code: '23505', cause: { code: '40001' } };
    expect(getPostgresErrorCode(error)).toBe('40001');
  });

  it('returns undefined for Node.js error codes (not 5-char SQLSTATE)', () => {
    const error = { code: 'ECONNREFUSED' };
    expect(getPostgresErrorCode(error)).toBeUndefined();
  });

  it('returns undefined for Node.js code on .cause', () => {
    const error = { message: 'connect failed', cause: { code: 'ECONNRESET' } };
    expect(getPostgresErrorCode(error)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(getPostgresErrorCode(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getPostgresErrorCode(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object', () => {
    expect(getPostgresErrorCode('string')).toBeUndefined();
    expect(getPostgresErrorCode(42)).toBeUndefined();
  });

  it('returns undefined for error with no code', () => {
    const error = { message: 'some error' };
    expect(getPostgresErrorCode(error)).toBeUndefined();
  });

  it('returns undefined for numeric .code', () => {
    const error = { code: 12345 };
    expect(getPostgresErrorCode(error)).toBeUndefined();
  });
});

describe('isRetryableError', () => {
  describe('SQLSTATE codes', () => {
    it('returns true for serialization failure (40001)', () => {
      const error = { cause: { code: '40001' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for deadlock detected (40P01)', () => {
      const error = { cause: { code: '40P01' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for connection exception (08000)', () => {
      const error = { cause: { code: '08000' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for connection failure (08006)', () => {
      const error = { cause: { code: '08006' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for admin shutdown (57P01)', () => {
      const error = { cause: { code: '57P01' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for too many connections (53300)', () => {
      const error = { cause: { code: '53300' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for lock not available (55P03)', () => {
      const error = { cause: { code: '55P03' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for query canceled (57014)', () => {
      const error = { cause: { code: '57014' } };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns false for unique violation (23505)', () => {
      const error = { cause: { code: '23505' } };
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns false for undefined table (42P01)', () => {
      const error = { cause: { code: '42P01' } };
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns false for syntax error (42601)', () => {
      const error = { cause: { code: '42601' } };
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns true for raw DatabaseError with retryable code', () => {
      const error = { code: '40001', message: 'serialization failure' };
      expect(isRetryableError(error)).toBe(true);
    });
  });

  describe('Node.js network codes', () => {
    it('returns true for ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for ECONNRESET', () => {
      const error = { code: 'ECONNRESET' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for EPIPE', () => {
      const error = { code: 'EPIPE' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for ETIMEDOUT', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for EAI_AGAIN', () => {
      const error = { code: 'EAI_AGAIN' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for EHOSTUNREACH', () => {
      const error = { code: 'EHOSTUNREACH' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for ENETUNREACH', () => {
      const error = { code: 'ENETUNREACH' };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for Node.js code on .cause', () => {
      const error = {
        message: 'connection error',
        cause: { code: 'ECONNREFUSED' },
      };
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns false for unknown error code', () => {
      const error = { code: 'ENOENT' };
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('pool messages', () => {
    it('returns true for pool queue timeout', () => {
      const error = new Error('timeout exceeded when trying to connect');
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for connection timeout', () => {
      const error = new Error('Connection terminated due to connection timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for unexpected disconnect', () => {
      const error = new Error('Connection terminated unexpectedly');
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns false for pool-ended error', () => {
      const error = new Error('Cannot use a pool after calling end on the pool');
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns true for pool message on .cause', () => {
      const error = {
        message: 'query failed',
        cause: {
          message: 'timeout exceeded when trying to connect',
        },
      };
      expect(isRetryableError(error)).toBe(true);
    });
  });

  describe('custom code set', () => {
    it('respects custom retryable code set', () => {
      const customCodes = new Set(['23505']);
      const error = { cause: { code: '23505' } };
      expect(isRetryableError(error, customCodes)).toBe(true);
    });

    it('does not retry default codes when using custom set without them', () => {
      const customCodes = new Set(['23505']);
      const error = { cause: { code: '40001' } };
      expect(isRetryableError(error, customCodes)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for null', () => {
      expect(isRetryableError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isRetryableError(undefined)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isRetryableError('string')).toBe(false);
      expect(isRetryableError(42)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isRetryableError({})).toBe(false);
    });
  });
});

describe('DEFAULT_RETRYABLE_CODES', () => {
  it('contains 15 SQLSTATE codes across all tiers', () => {
    expect(DEFAULT_RETRYABLE_CODES.size).toBe(15);
  });

  it('contains Tier 1 codes', () => {
    expect(DEFAULT_RETRYABLE_CODES.has('40001')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('40P01')).toBe(true);
  });

  it('contains Tier 2 codes', () => {
    expect(DEFAULT_RETRYABLE_CODES.has('08000')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('08003')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('08006')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('08001')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('08004')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('57P01')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('57P03')).toBe(true);
  });

  it('contains Tier 3 codes', () => {
    expect(DEFAULT_RETRYABLE_CODES.has('53000')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('53100')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('53200')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('53300')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('55P03')).toBe(true);
    expect(DEFAULT_RETRYABLE_CODES.has('57014')).toBe(true);
  });
});

describe('RETRYABLE_NODE_ERROR_CODES', () => {
  it('contains 7 Node.js error codes', () => {
    expect(RETRYABLE_NODE_ERROR_CODES.size).toBe(7);
  });
});

describe('RETRYABLE_POOL_MESSAGES', () => {
  it('contains 3 pool messages', () => {
    expect(RETRYABLE_POOL_MESSAGES).toHaveLength(3);
  });
});
