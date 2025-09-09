/**
 * API Configuration
 *
 * Centralized configuration for API endpoints and settings
 */

import { ApiError } from '../types/errors';

const DEFAULT_MANAGEMENT_API_BASE_URL = 'http://localhost:3002';
const DEFAULT_EXECUTION_API_BASE_URL = 'http://localhost:3003';

// Management API (CRUD operations, configuration)
if (!process.env.NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL) {
  console.warn(
    `NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL is not set, falling back to: ${DEFAULT_MANAGEMENT_API_BASE_URL}`
  );
}

// Execution API (chat completions, agent execution)
if (!process.env.NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL) {
  console.warn(
    `NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL is not set, falling back to: ${DEFAULT_EXECUTION_API_BASE_URL}`
  );
}

export const MANAGEMENT_API_BASE_URL =
  process.env.NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL || DEFAULT_MANAGEMENT_API_BASE_URL;
export const EXECUTION_API_BASE_URL =
  process.env.NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL || DEFAULT_EXECUTION_API_BASE_URL;

async function makeApiRequestInternal<T>(
  baseUrl: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}/${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(process.env.INKEEP_AGENTS_MANAGE_API_SECRET && {
      Authorization: `Bearer ${process.env.INKEEP_AGENTS_MANAGE_API_SECRET}`,
    }),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: defaultHeaders,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: { code: 'unknown', message: 'Unknown error occurred' },
      }));

      throw new ApiError(
        errorData.error || { code: 'unknown', message: 'Unknown error occurred' },
        response.status
      );
    }

    // Check if there's actually content to parse
    const contentType = response.headers.get('content-type');
    const hasJsonContent = contentType?.includes('application/json');

    // Try to parse JSON if we expect JSON content
    if (hasJsonContent) {
      const text = await response.text();
      return text ? JSON.parse(text) : (undefined as T);
    }

    // For non-JSON responses or empty responses
    return undefined as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network or other errors
    throw new ApiError(
      {
        code: 'internal_server_error',
        message: error instanceof Error ? error.message : 'Network error occurred',
      },
      500
    );
  }
}

// Management API requests (CRUD operations, configuration)
export async function makeManagementApiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  return makeApiRequestInternal<T>(MANAGEMENT_API_BASE_URL, endpoint, options);
}

// Execution API requests (chat completions, agent execution)
export async function makeExecutionApiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  return makeApiRequestInternal<T>(EXECUTION_API_BASE_URL, endpoint, options);
}
