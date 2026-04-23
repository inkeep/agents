/**
 * Generic API error interface and class for handling API errors consistently across the application
 */

interface ApiErrorData {
  code: string;
  message: string;
}

export class ApiError extends Error {
  public readonly error: ApiErrorData;
  public readonly status: number;
  public readonly data: Record<string, unknown> | undefined;

  constructor(error: ApiErrorData, status: number, data?: Record<string, unknown>) {
    super(error.message);
    this.name = 'ApiError';
    this.error = error;
    this.status = status;
    this.data = data;
  }
}
