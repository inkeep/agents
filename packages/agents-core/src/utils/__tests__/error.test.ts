import { describe, expect, it } from 'vitest';
import { createApiError, isUniqueConstraintError, throwIfUniqueConstraintError } from '../error';

describe('sanitizeErrorMessage (via createApiError)', () => {
  async function getResponseBody(
    message: string,
    code: 'internal_server_error' | 'bad_request' = 'internal_server_error'
  ) {
    const exception = createApiError({ code, message });
    return JSON.parse(await exception.getResponse().text());
  }

  it('redacts IPv4 addresses with port', async () => {
    const body = await getResponseBody('connect ECONNREFUSED 10.0.0.5:5432');
    expect(body.detail).toBe('connect ECONNREFUSED [REDACTED_HOST]');
    expect(body.detail).not.toContain('10.0.0.5');
  });

  it('redacts IPv4 addresses without port', async () => {
    const body = await getResponseBody('could not connect to 192.168.1.1');
    expect(body.detail).not.toContain('192.168.1.1');
    expect(body.detail).toContain('[REDACTED_HOST]');
  });

  it('redacts PostgreSQL connection strings', async () => {
    const body = await getResponseBody('postgresql://appuser:pass@host:5432/db failed');
    expect(body.detail).toBe('[REDACTED_CONNECTION] failed');
    expect(body.detail).not.toContain('appuser');
  });

  it('redacts connection string containing IP without leaking credentials', async () => {
    const body = await getResponseBody(
      'postgresql://admin:s3cret@10.0.0.5:5432/mydb connection failed'
    );
    expect(body.detail).toBe('[REDACTED_CONNECTION] connection failed');
    expect(body.detail).not.toContain('admin');
    expect(body.detail).not.toContain('s3cret');
    expect(body.detail).not.toContain('10.0.0.5');
  });

  it('redacts other database connection schemes', async () => {
    const mysql = await getResponseBody('mysql://root:pass@db:3306/app failed');
    expect(mysql.detail).toBe('[REDACTED_CONNECTION] failed');

    const redis = await getResponseBody('redis://default:pass@cache:6379 timeout');
    expect(redis.detail).toBe('[REDACTED_CONNECTION] timeout');

    const mongo = await getResponseBody('mongodb+srv://user:pass@cluster.example.com/db error');
    expect(mongo.detail).toBe('[REDACTED_CONNECTION] error');
  });

  it('redacts server file paths', async () => {
    const body = await getResponseBody('Error at /var/task/packages/agents-core/dist/index.js:42');
    expect(body.detail).not.toContain('/var/task');
    expect(body.detail).toContain('[REDACTED_PATH]');
  });

  it('redacts /tmp paths', async () => {
    const body = await getResponseBody('Cannot read /tmp/secrets.json');
    expect(body.detail).not.toContain('/tmp/secrets.json');
    expect(body.detail).toContain('[REDACTED_PATH]');
  });

  it('redacts sensitive keywords', async () => {
    const body = await getResponseBody('Invalid auth token');
    expect(body.detail).toBe('Invalid [REDACTED] [REDACTED]');
  });

  it('redacts credential keyword', async () => {
    const body = await getResponseBody('Failed to fetch credential');
    expect(body.detail).toBe('Failed to fetch [REDACTED]');
  });

  it('preserves safe messages unchanged', async () => {
    const body = await getResponseBody('Failed to retrieve project');
    expect(body.detail).toBe('Failed to retrieve project');
  });

  it('handles multiple patterns in one message', async () => {
    const body = await getResponseBody(
      'connect to 10.0.0.5:5432 at /var/log/app.log with password'
    );
    expect(body.detail).not.toContain('10.0.0.5');
    expect(body.detail).not.toContain('/var/log');
    expect(body.detail).not.toContain('password');
  });
});

describe('createApiError sanitization integration', () => {
  it('sanitizes 500 response body', async () => {
    const exception = createApiError({
      code: 'internal_server_error',
      message: 'connect ECONNREFUSED 10.0.0.5:5432',
    });
    const body = JSON.parse(await exception.getResponse().text());
    expect(body.detail).not.toContain('10.0.0.5');
    expect(body.error.message).not.toContain('10.0.0.5');
    expect(body.status).toBe(500);
  });

  it('preserves 400 response body unchanged', async () => {
    const message = 'Missing required header: x-api-key with auth token';
    const exception = createApiError({ code: 'bad_request', message });
    const body = JSON.parse(await exception.getResponse().text());
    expect(body.detail).toBe(message);
    expect(body.error.message).toBe(message);
    expect(body.status).toBe(400);
  });

  it('preserves 404 response body unchanged', async () => {
    const message = 'Agent not found at /var/task/agents';
    const exception = createApiError({ code: 'not_found', message });
    const body = JSON.parse(await exception.getResponse().text());
    expect(body.detail).toBe(message);
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
