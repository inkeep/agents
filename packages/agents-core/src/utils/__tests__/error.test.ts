import { describe, expect, it } from 'vitest';
import {
  createApiError,
  getDatabaseErrorLogContext,
  handleApiError,
  isUniqueConstraintError,
  throwIfUniqueConstraintError,
} from '../error';

const STATIC_500_MESSAGE = 'An internal server error occurred. Please try again later.';

describe('createApiError 500 static message', () => {
  async function getResponseBody(
    message: string,
    code: 'internal_server_error' | 'bad_request' | 'not_found' = 'internal_server_error'
  ) {
    const exception = createApiError({ code, message });
    return JSON.parse(await exception.getResponse().text());
  }

  it('returns static message for 500 regardless of input', async () => {
    const body = await getResponseBody('connect ECONNREFUSED 10.0.0.5:5432');
    expect(body.detail).toBe(STATIC_500_MESSAGE);
    expect(body.error.message).toBe(STATIC_500_MESSAGE);
    expect(body.status).toBe(500);
  });

  it('never leaks connection strings', async () => {
    const body = await getResponseBody('postgresql://appuser:pass@host:5432/db failed');
    expect(body.detail).not.toContain('appuser');
    expect(body.detail).not.toContain('pass');
    expect(body.detail).not.toContain('postgresql');
  });

  it('never leaks file paths', async () => {
    const body = await getResponseBody('Error at /var/task/packages/agents-core/dist/index.js:42');
    expect(body.detail).not.toContain('/var/task');
  });

  it('never leaks IP addresses', async () => {
    const body = await getResponseBody('connect to 192.168.1.1:5432 failed');
    expect(body.detail).not.toContain('192.168.1.1');
  });

  it('includes requestId when provided', async () => {
    const exception = createApiError({
      code: 'internal_server_error',
      message: 'some secret error',
      requestId: 'req-abc123',
    });
    const body = JSON.parse(await exception.getResponse().text());
    expect(body.requestId).toBe('req-abc123');
    expect(body.detail).toBe(STATIC_500_MESSAGE);
  });

  it('preserves 400 response body unchanged', async () => {
    const message = 'Missing required header: x-api-key with auth token';
    const body = await getResponseBody(message, 'bad_request');
    expect(body.detail).toBe(message);
    expect(body.error.message).toBe(message);
    expect(body.status).toBe(400);
  });

  it('preserves 404 response body unchanged', async () => {
    const message = 'Agent not found';
    const body = await getResponseBody(message, 'not_found');
    expect(body.detail).toBe(message);
  });
});

describe('handleApiError 500 static message', () => {
  it('returns static message for raw Error', async () => {
    const error = new Error('connect ECONNREFUSED 10.0.0.5:5432');
    const result = await handleApiError(error, 'req-123');
    expect(result.detail).toBe(STATIC_500_MESSAGE);
    expect(result.error.message).toBe(STATIC_500_MESSAGE);
    expect(result.requestId).toBe('req-123');
  });

  it('never leaks connection strings from raw errors', async () => {
    const error = new Error('postgresql://user:pass@host/db failed');
    const result = await handleApiError(error, 'req-456');
    expect(result.detail).not.toContain('user');
    expect(result.detail).not.toContain('pass');
  });

  it('returns static message for non-Error values', async () => {
    const result = await handleApiError('string error', 'req-789');
    expect(result.detail).toBe(STATIC_500_MESSAGE);
    expect(result.status).toBe(500);
  });

  it('returns static message for HTTPException 500s', async () => {
    const inner = createApiError({
      code: 'internal_server_error',
      message: 'secret database details',
    });
    const result = await handleApiError(inner, 'req-abc');
    expect(result.detail).toBe(STATIC_500_MESSAGE);
    expect(result.error.message).toBe(STATIC_500_MESSAGE);
  });

  it('preserves 4xx HTTPException messages', async () => {
    const message = 'Resource not found';
    const inner = createApiError({ code: 'not_found', message });
    const result = await handleApiError(inner, 'req-def');
    expect(result.detail).toBe(message);
  });
});

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
