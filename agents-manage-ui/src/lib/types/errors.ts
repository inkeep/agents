/**
 * Generic API error interface and class for handling API errors consistently across the application
 */

export interface ApiErrorData {
  code: string;
  message: string;
}

export class ApiError extends Error {
  public readonly error: ApiErrorData;
  public readonly status: number;

  constructor(error: ApiErrorData, status: number) {
    super(error.message);
    this.name = 'ApiError';
    this.error = error;
    this.status = status;
  }
}
