/**
 * API Configuration
 *
 * Centralized configuration for API endpoints and settings
 */

import { DEFAULT_INKEEP_AGENTS_MANAGE_API_URL } from '../runtime-config/defaults';
import { ApiError } from '../types/errors';

// Lazy initialization with runtime warnings
let INKEEP_AGENTS_MANAGE_API_URL: string | null = null;
let hasWarnedManageApi = false;

function getManageApiUrl(): string {
  if (INKEEP_AGENTS_MANAGE_API_URL === null) {
    INKEEP_AGENTS_MANAGE_API_URL =
      process.env.INKEEP_AGENTS_MANAGE_API_URL || DEFAULT_INKEEP_AGENTS_MANAGE_API_URL;

    if (!process.env.INKEEP_AGENTS_MANAGE_API_URL && !hasWarnedManageApi) {
      console.warn(
        `INKEEP_AGENTS_MANAGE_API_URL is not set, falling back to: ${DEFAULT_INKEEP_AGENTS_MANAGE_API_URL}`
      );
      hasWarnedManageApi = true;
    }
  }
  return INKEEP_AGENTS_MANAGE_API_URL;
}

async function makeApiRequestInternal<T>(
  baseUrl: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}/${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET && {
      Authorization: `Bearer ${process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET}`,
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
        errorData.error || {
          code: 'unknown',
          message: 'Unknown error occurred',
        },
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
  return makeApiRequestInternal<T>(getManageApiUrl(), endpoint, options);
}
