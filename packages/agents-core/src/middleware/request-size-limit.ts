import type { Context, MiddlewareHandler } from 'hono';
import { createApiError } from '../utils/error';
import { getLogger } from '../utils/logger';

const logger = getLogger('request-size-limit');

/**
 * Default maximum request size: 1GB (1,073,741,824 bytes)
 * This is an API-level limit independent of model constraints
 */
export const DEFAULT_MAX_REQUEST_SIZE_BYTES = 1073741824;

/**
 * Request size limit middleware options
 */
export interface RequestSizeLimitOptions {
  /**
   * Maximum request size in bytes
   * Default: 1GB (1,073,741,824 bytes)
   */
  maxRequestSizeBytes?: number;
}

/**
 * Middleware to enforce request payload size limits via Content-Length header validation.
 *
 * This middleware checks the Content-Length header of incoming requests and returns
 * a 413 Payload Too Large error if the size exceeds the configured limit.
 *
 * Key features:
 * - Validates Content-Length header before expensive body parsing
 * - Skips validation for GET, HEAD, and OPTIONS requests (no body expected)
 * - Returns standard Problem+JSON error response on failure
 * - Logs violations for monitoring
 *
 * @param options - Configuration options
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * import { requestSizeLimitMiddleware } from '@inkeep/agents-core';
 *
 * app.use('*', requestSizeLimitMiddleware({
 *   maxRequestSizeBytes: 1073741824 // 1GB
 * }));
 * ```
 */
export function requestSizeLimitMiddleware(
  options: RequestSizeLimitOptions = {}
): MiddlewareHandler {
  const maxSize = options.maxRequestSizeBytes ?? DEFAULT_MAX_REQUEST_SIZE_BYTES;

  return async (c: Context, next) => {
    const method = c.req.method;

    // Skip validation for methods that don't typically have request bodies
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    // Get Content-Length header
    const contentLength = c.req.header('content-length');

    // If Content-Length is not provided, allow the request to proceed
    // (body parsing middleware will handle missing/malformed bodies)
    if (!contentLength) {
      return next();
    }

    const requestSize = Number.parseInt(contentLength, 10);

    // Validate Content-Length is a valid number
    if (Number.isNaN(requestSize) || requestSize < 0) {
      logger.warn(
        {
          contentLength,
          method,
          path: c.req.path,
        },
        'Invalid Content-Length header received'
      );
      return next(); // Allow to proceed, body parser will handle the error
    }

    // Check if request size exceeds limit
    if (requestSize > maxSize) {
      logger.warn(
        {
          requestSize,
          maxSize,
          method,
          path: c.req.path,
          userAgent: c.req.header('user-agent'),
        },
        'Request payload size exceeds maximum allowed size'
      );

      throw createApiError({
        code: 'payload_too_large',
        message: `Request payload size (${requestSize} bytes) exceeds maximum allowed size of ${maxSize} bytes`,
      });
    }

    // Request size is within limits, proceed
    return next();
  };
}
