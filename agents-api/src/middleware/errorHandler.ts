import { handleApiError } from '@inkeep/agents-core';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { StatusCode } from 'hono/utils/http-status';
import type { ZodIssue } from 'zod';
import { getLogger } from '../logger';

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
  c.header('X-Content-Type-Options', 'nosniff');
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
 * Log server errors with appropriate context
 */
function logServerError(
  err: unknown,
  path: string,
  requestId: string,
  status: number,
  isExpectedError: boolean
) {
  if (!isExpectedError) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    logger.error(
      {
        error: err,
        message: errorMessage,
        stack: errorStack,
        path,
        requestId,
      },
      'Unexpected server error occurred'
    );
  } else {
    logger.error(
      {
        error: err,
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

  // Log server errors
  if (status >= 500) {
    logServerError(err, c.req.path, requestId, status, isExpectedError);
  }

  // Format as RFC 7807 Problem Details
  const errorResponse = await handleApiError(err, requestId);
  c.status(errorResponse.status as StatusCode);

  const responseBody = {
    ...(errorResponse.code && { code: errorResponse.code }),
    title: errorResponse.title,
    status: errorResponse.status,
    detail: errorResponse.detail,
    ...(errorResponse.instance && { instance: errorResponse.instance }),
    ...(errorResponse.error && { error: errorResponse.error }),
  };

  c.header('Content-Type', 'application/problem+json');
  c.header('X-Content-Type-Options', 'nosniff');

  return c.body(JSON.stringify(responseBody));
}
