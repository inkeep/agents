/**
 * Extracts error code from various error types.
 * Works with ApiError, plain Error, or any object with error.code or code properties.
 *
 * This is useful for passing error codes to FullPageError in production builds
 * where error messages are stripped by Next.js when thrown from Server Components.
 *
 * Note: We intentionally only pass the code (not the message) for security reasons.
 * Error messages could contain sensitive information (stack traces, internal paths, etc.)
 * The frontend generates user-friendly messages from the code instead.
 */
export function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const err = error as {
    error?: { code?: string };
    code?: string;
    status?: number;
  };

  if (err.error?.code) {
    return err.error.code;
  }

  if (err.code) {
    return err.code;
  }

  if (err.status) {
    return getCodeFromStatus(err.status);
  }

  return undefined;
}

function getCodeFromStatus(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 422:
      return 'unprocessable_entity';
    case 500:
      return 'internal_server_error';
    case 503:
      return 'service_unavailable';
    default:
      return 'unknown_error';
  }
}
