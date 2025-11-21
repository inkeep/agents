/**
 * Serializes API errors for Next.js server-to-client boundary
 * 
 * Next.js doesn't preserve custom error properties during SSR serialization,
 * so we need to explicitly serialize the status code and message in the cause property
 */
export function serializeApiErrorForClient(
  apiError: unknown
): Error & { cause?: { status: number; message: string } } {
  const error = apiError as {
    message?: string;
    status?: number;
    error?: { message?: string };
  };

  const serializedError = new Error(error.message || 'An error occurred') as Error & {
    cause?: { status: number; message: string };
  };

  if (error.status) {
    serializedError.cause = {
      status: error.status,
      message: error.error?.message || error.message || 'An error occurred',
    };
  }

  return serializedError;
}

