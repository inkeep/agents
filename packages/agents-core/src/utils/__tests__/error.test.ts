import { describe, expect, it } from 'vitest';
import { isUniqueConstraintError, throwIfUniqueConstraintError } from '../error';

describe('isUniqueConstraintError', () => {
  describe('PostgreSQL unique violation (23505)', () => {
    it('returns true when cause.code is 23505', () => {
      const error = { cause: { code: '23505' }, message: 'Failed query: INSERT ...' };
      expect(isUniqueConstraintError(error)).toBe(true);
    });

    it('returns false when cause.code is a different PG error code', () => {
      const error = { cause: { code: '40001' }, message: 'Failed query: INSERT ...' };
      expect(isUniqueConstraintError(error)).toBe(false);
    });
  });

  describe('Doltgres MySQL errno 1062', () => {
    it('returns true when cause.message contains 1062', () => {
      const error = {
        cause: { code: 'XX000', message: "1062: Duplicate entry 'x' for key 'PRIMARY'" },
        message: 'Failed query: INSERT ...',
      };
      expect(isUniqueConstraintError(error)).toBe(true);
    });

    it('returns false when cause.message contains a different MySQL errno', () => {
      const error = {
        cause: { code: 'XX000', message: '1213: Deadlock found when trying to get lock' },
        message: 'Failed query: INSERT ...',
      };
      expect(isUniqueConstraintError(error)).toBe(false);
    });
  });

  describe('"already exists" message fallback', () => {
    it('returns true when error message contains "already exists"', () => {
      const error = { message: "Branch 'main' already exists" };
      expect(isUniqueConstraintError(error)).toBe(true);
    });

    it('returns false when error message does not contain "already exists"', () => {
      const error = { message: 'Branch creation failed' };
      expect(isUniqueConstraintError(error)).toBe(false);
    });
  });

  describe('non-matching errors', () => {
    it('returns false for a generic Error', () => {
      expect(isUniqueConstraintError(new Error('Something went wrong'))).toBe(false);
    });

    it('returns false for null', () => {
      expect(isUniqueConstraintError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isUniqueConstraintError(undefined)).toBe(false);
    });

    it('returns false for a plain string', () => {
      expect(isUniqueConstraintError('duplicate key error')).toBe(false);
    });

    it('returns false for an error with no cause and no matching message', () => {
      expect(isUniqueConstraintError({ message: 'Connection timeout' })).toBe(false);
    });
  });
});

describe('throwIfUniqueConstraintError', () => {
  it('throws for a PostgreSQL 23505 error', () => {
    const error = { cause: { code: '23505' }, message: 'Failed query: INSERT ...' };
    expect(() => throwIfUniqueConstraintError(error, 'Resource already exists')).toThrow();
  });

  it('throws for a Doltgres 1062 error', () => {
    const error = {
      cause: { code: 'XX000', message: "1062: Duplicate entry 'x' for key 'PRIMARY'" },
      message: 'Failed query: INSERT ...',
    };
    expect(() => throwIfUniqueConstraintError(error, 'Resource already exists')).toThrow();
  });

  it('throws with conflict code and provided message', async () => {
    const error = { cause: { code: '23505' }, message: 'Failed query: INSERT ...' };
    let caught: any;
    try {
      throwIfUniqueConstraintError(error, "Agent with ID 'x' already exists");
    } catch (e) {
      caught = e;
    }
    const body = JSON.parse(await caught.getResponse().text());
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toBe("Agent with ID 'x' already exists");
  });

  it('does not throw for a non-unique-constraint error', () => {
    expect(() =>
      throwIfUniqueConstraintError(new Error('Connection timeout'), 'Resource already exists')
    ).not.toThrow();
  });

  it('does not throw for null', () => {
    expect(() => throwIfUniqueConstraintError(null, 'Resource already exists')).not.toThrow();
  });
});
