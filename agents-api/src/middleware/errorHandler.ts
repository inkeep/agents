import { getDatabaseErrorLogContext, handleApiError } from '@inkeep/agents-core';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { StatusCode } from 'hono/utils/http-status';
import type { ZodIssue } from 'zod';
import { getLogger } from '../logger';
import { sentry } from '../sentry';

const logger = getLogger('error-handler');

/**
 * Extract Zod validation issues from an error object
 */
function extractZodIssues(err: unknown): ZodIssue[] | undefined {
  if (err && typeof err === 'object') {
    if ('cause' in err && err.cause && typeof err.cause === 'object' && 'issues' in err.cause) {
      const issues = (err.cause as { issues: unknown }).issues;
      if (Array.isArray(issues)) {
        return issues as ZodIssue[];
      }
    }
    if ('issues' in err && Array.isArray((err as { issues: unknown }).issues)) {
      return (err as { issues: ZodIssue[] }).issues;
    }
  }
  return undefined;
}

/**
 * Format Zod validation errors into RFC 7807 problem detail format
 */
function formatZodValidationError(c: Context, zodIssues: ZodIssue[]) {
  c.status(400);
  c.header('Content-Type', 'application/problem+json');
  return c.json({
    type: 'https://docs.inkeep.com/agents-api/errors#bad_request',
    title: 'Validation Failed',
    status: 400,
    detail: 'Request validation failed',
    errors: zodIssues.map((issue) => ({
      detail: issue.message,
      pointer: issue.path ? `/${issue.path.join('/')}` : undefined,
      name: issue.path ? issue.path.join('.') : undefined,
      reason: issue.message,
    })),
  });
}

/**
 * Serialize an error's cause chain into a loggable object.
 * Native Error properties (message, stack, code) are non-enumerable so
 * JSON.stringify produces "{}". This helper extracts them explicitly.
 */
function serializeCause(cause: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!cause || depth > 3) return undefined;
  if (cause instanceof Error) {
    return {
      message: cause.message,
      name: cause.name,
      stack: cause.stack,
      ...('code' in cause ? { code: (cause as any).code } : {}),
      ...('severity' in cause ? { severity: (cause as any).severity } : {}),
      ...('detail' in cause ? { detail: (cause as any).detail } : {}),
      ...('hint' in cause ? { hint: (cause as any).hint } : {}),
      ...(cause.cause ? { cause: serializeCause(cause.cause, depth + 1) } : {}),
    };
  }
  if (typeof cause === 'object') {
    const obj = cause as Record<string, unknown>;
    return {
      ...(obj.message != null ? { message: obj.message } : {}),
      ...(obj.code != null ? { code: obj.code } : {}),
      ...(obj.severity != null ? { severity: obj.severity } : {}),
      ...(obj.detail != null ? { detail: obj.detail } : {}),
    };
  }
  return { value: String(cause) };
}

/**
 * Log server errors with appropriate context
 */
function logServerError(
  err: unknown,
  path: string,
  requestId: string,
  status: number,
  isExpectedError: boolean
) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : undefined;
  const cause = err instanceof Error ? serializeCause(err.cause) : undefined;

  if (!isExpectedError) {
    logger.error(
      {
        ...getDatabaseErrorLogContext(err),
        message: errorMessage,
        stack: errorStack,
        ...(cause && { dbError: cause }),
        path,
        requestId,
      },
      'Unexpected server error occurred'
    );
  } else {
    logger.error(
      {
        ...getDatabaseErrorLogContext(err),
        message: errorMessage,
        ...(cause && { dbError: cause }),
        path,
        requestId,
        status,
      },
      'Server error occurred'
    );
  }
}

/**
 * Global error handler for the Hono application
 * Handles Zod validation errors, HTTP exceptions, and unexpected errors
 * Returns RFC 7807 Problem Details format
 */
export async function errorHandler(err: Error, c: Context): Promise<Response> {
  const isExpectedError = err instanceof HTTPException;
  const status = isExpectedError ? err.status : 500;
  const requestId = c.get('requestId') || 'unknown';

  // Handle Zod validation errors
  const zodIssues = extractZodIssues(err);
  if (status === 400 && zodIssues) {
    return formatZodValidationError(c, zodIssues);
  }

  // Log and report server errors
  if (status >= 500) {
    logServerError(err, c.req.path, requestId, status, isExpectedError);

    sentry.captureException(err, {
      extra: { requestId, path: c.req.path, status },
    });
  }

  // Format as RFC 7807 Problem Details
  const errorResponse = await handleApiError(err, requestId);
  c.status(errorResponse.status as StatusCode);

  const {
    code,
    title,
    status: responseStatus,
    detail,
    instance,
    requestId: _reqId,
    error: errorObj,
    ...extensions
  } = errorResponse;
  const responseBody = {
    ...(code && { code }),
    title,
    status: responseStatus,
    detail,
    ...(instance && { instance }),
    ...(errorObj && { error: errorObj }),
    ...extensions,
  };

  c.header('Content-Type', 'application/problem+json');

  return c.body(JSON.stringify(responseBody));
}
