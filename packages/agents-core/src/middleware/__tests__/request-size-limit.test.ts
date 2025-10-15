import { describe, expect, it, vi } from 'vitest';
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  DEFAULT_MAX_REQUEST_SIZE_BYTES,
  requestSizeLimitMiddleware,
} from '../request-size-limit';

describe('requestSizeLimitMiddleware', () => {
  const createMockContext = (
    method: string,
    contentLength?: string
  ): { c: Context; next: Next } => {
    const c = {
      req: {
        method,
        path: '/test',
        header: vi.fn((name: string) => {
          if (name === 'content-length') return contentLength;
          if (name === 'user-agent') return 'test-agent';
          return undefined;
        }),
      },
    } as unknown as Context;

    const next = vi.fn(() => Promise.resolve());

    return { c, next };
  };

  describe('Method Skipping', () => {
    it('should skip validation for GET requests', async () => {
      const { c, next } = createMockContext('GET');
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should skip validation for HEAD requests', async () => {
      const { c, next } = createMockContext('HEAD');
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should skip validation for OPTIONS requests', async () => {
      const { c, next } = createMockContext('OPTIONS');
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Content-Length Header', () => {
    it('should allow request when Content-Length is missing', async () => {
      const { c, next } = createMockContext('POST', undefined);
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow request when Content-Length is invalid', async () => {
      const { c, next } = createMockContext('POST', 'invalid');
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow request when Content-Length is negative', async () => {
      const { c, next } = createMockContext('POST', '-100');
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Size Validation', () => {
    it('should allow request under the default limit', async () => {
      const { c, next } = createMockContext('POST', '1000000'); // 1MB
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow request at exactly the default limit', async () => {
      const { c, next } = createMockContext('POST', String(DEFAULT_MAX_REQUEST_SIZE_BYTES));
      const middleware = requestSizeLimitMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject request exceeding the default limit', async () => {
      const { c, next } = createMockContext('POST', String(DEFAULT_MAX_REQUEST_SIZE_BYTES + 1));
      const middleware = requestSizeLimitMiddleware();

      await expect(middleware(c, next)).rejects.toThrow(HTTPException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request exceeding custom limit', async () => {
      const customLimit = 1000;
      const { c, next } = createMockContext('POST', '2000');
      const middleware = requestSizeLimitMiddleware({ maxRequestSizeBytes: customLimit });

      await expect(middleware(c, next)).rejects.toThrow(HTTPException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow request under custom limit', async () => {
      const customLimit = 5000;
      const { c, next } = createMockContext('POST', '3000');
      const middleware = requestSizeLimitMiddleware({ maxRequestSizeBytes: customLimit });

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Error Response', () => {
    it('should throw HTTPException with 413 status', async () => {
      const { c, next } = createMockContext('POST', String(DEFAULT_MAX_REQUEST_SIZE_BYTES + 1));
      const middleware = requestSizeLimitMiddleware();

      try {
        await middleware(c, next);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPException);
        const httpError = error as HTTPException;
        expect(httpError.status).toBe(413);
      }
    });

    it('should include payload_too_large error code in response', async () => {
      const { c, next } = createMockContext('POST', String(DEFAULT_MAX_REQUEST_SIZE_BYTES + 1));
      const middleware = requestSizeLimitMiddleware();

      try {
        await middleware(c, next);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPException);
        const httpError = error as HTTPException;
        const response = httpError.getResponse();
        const body = await response.json();
        expect(body.code).toBe('payload_too_large');
      }
    });

    it('should include size information in error message', async () => {
      const requestSize = DEFAULT_MAX_REQUEST_SIZE_BYTES + 1000;
      const { c, next } = createMockContext('POST', String(requestSize));
      const middleware = requestSizeLimitMiddleware();

      try {
        await middleware(c, next);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HTTPException);
        const httpError = error as HTTPException;
        const response = httpError.getResponse();
        const body = await response.json();
        expect(body.detail).toContain(String(requestSize));
        expect(body.detail).toContain(String(DEFAULT_MAX_REQUEST_SIZE_BYTES));
      }
    });
  });

  describe('Different HTTP Methods', () => {
    it('should validate POST requests', async () => {
      const { c, next } = createMockContext('POST', String(DEFAULT_MAX_REQUEST_SIZE_BYTES + 1));
      const middleware = requestSizeLimitMiddleware();

      await expect(middleware(c, next)).rejects.toThrow(HTTPException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate PUT requests', async () => {
      const { c, next } = createMockContext('PUT', String(DEFAULT_MAX_REQUEST_SIZE_BYTES + 1));
      const middleware = requestSizeLimitMiddleware();

      await expect(middleware(c, next)).rejects.toThrow(HTTPException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate PATCH requests', async () => {
      const { c, next } = createMockContext('PATCH', String(DEFAULT_MAX_REQUEST_SIZE_BYTES + 1));
      const middleware = requestSizeLimitMiddleware();

      await expect(middleware(c, next)).rejects.toThrow(HTTPException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate DELETE requests with body', async () => {
      const { c, next } = createMockContext('DELETE', String(DEFAULT_MAX_REQUEST_SIZE_BYTES + 1));
      const middleware = requestSizeLimitMiddleware();

      await expect(middleware(c, next)).rejects.toThrow(HTTPException);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
