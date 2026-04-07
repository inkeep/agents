import { describe, expect, it } from 'vitest';
import {
  getDatabaseErrorLogContext,
  isUniqueConstraintError,
  throwIfUniqueConstraintError,
} from '../error';

describe('getDatabaseErrorLogContext', () => {
  it('returns empty object for null', () => {
    expect(getDatabaseErrorLogContext(null)).toEqual({});
  });

  it('extracts PG fields from Drizzle-style cause chain', () => {
    const inner = {
      message: 'invalid input syntax for type json',
      code: '22P02',
      detail: 'Token "NaN" is invalid.',
      hint: 'See JSON spec.',
    };
    const outer = new Error('Failed query: insert into "x"');
    (outer as Error & { cause: unknown }).cause = inner;

    const ctx = getDatabaseErrorLogContext(outer);
    expect(ctx.dbRootCode).toBe('22P02');
    expect(ctx.dbRootDetail).toBe('Token "NaN" is invalid.');
    expect(ctx.dbRootHint).toBe('See JSON spec.');
    expect(ctx.dbRootMessage).toBe(inner.message);
    expect(Array.isArray(ctx.dbErrorChain)).toBe(true);
    expect(ctx.dbErrorChain).toHaveLength(2);
  });

  it('handles circular cause reference without infinite loop', () => {
    const err = new Error('loop');
    (err as any).cause = err;
    const ctx = getDatabaseErrorLogContext(err);
    expect(ctx.dbErrorChain).toHaveLength(1);
    expect(ctx.dbRootMessage).toBe('loop');
  });

  it('includes stack only at depth 0', () => {
    const inner = { message: 'inner error', stack: 'inner stack trace' };
    const outer = new Error('outer error');
    (outer as any).cause = inner;

    const ctx = getDatabaseErrorLogContext(outer);
    const chain = ctx.dbErrorChain as Record<string, unknown>[];
    expect(chain[0].stack).toBeDefined();
    expect(chain[1].stack).toBeUndefined();
  });

  it('redacts params values and keeps query', () => {
    const err = {
      message: 'insert failed',
      query: 'INSERT INTO users (email, password) VALUES ($1, $2)',
      params: ['user@example.com', 'secret-password'],
    };
    const ctx = getDatabaseErrorLogContext(err);
    const chain = ctx.dbErrorChain as Record<string, unknown>[];
    expect(chain[0].query).toBe(err.query);
    expect(chain[0].params).toBe('[2 params redacted]');
  });
});

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
