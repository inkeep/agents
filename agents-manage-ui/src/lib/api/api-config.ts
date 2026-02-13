/**
 * API Configuration
 *
 * Centralized configuration for API endpoints and settings
 */

import { BETTER_AUTH_COOKIE_PREFIX } from '../auth/constants';
import { DEFAULT_INKEEP_AGENTS_API_URL } from '../runtime-config/defaults';
import { ApiError } from '../types/errors';

// Lazy initialization with runtime warnings
let INKEEP_AGENTS_API_URL: string | null = null;
let hasWarnedAgentsApi = false;

export function getAgentsApiUrl(): string {
  if (INKEEP_AGENTS_API_URL === null) {
    INKEEP_AGENTS_API_URL = process.env.INKEEP_AGENTS_API_URL || DEFAULT_INKEEP_AGENTS_API_URL;

    if (!process.env.INKEEP_AGENTS_API_URL && !hasWarnedAgentsApi) {
      console.warn(
        `INKEEP_AGENTS_API_URL is not set, falling back to: ${DEFAULT_INKEEP_AGENTS_API_URL}`
      );
      hasWarnedAgentsApi = true;
    }
  }
  return INKEEP_AGENTS_API_URL;
}

async function makeApiRequestInternal<T>(
  baseUrl: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}/${endpoint}`;

  let cookieHeader: string | undefined;
  if (typeof window === 'undefined') {
    try {
      // Try using headers() first - this forwards the raw Cookie header from the incoming request
      const { headers } = await import('next/headers');
      const headerStore = await headers();
      const rawCookieHeader = headerStore.get('cookie');

      if (rawCookieHeader) {
        // Filter to only forward Better Auth cookies for security
        const cookiePairs = rawCookieHeader.split(';').map((c) => c.trim());
        const authCookies = cookiePairs.filter((c) => c.includes(BETTER_AUTH_COOKIE_PREFIX));
        cookieHeader = authCookies.join('; ');
      }

      // Fallback to cookies() if headers() didn't have the cookie
      if (!cookieHeader) {
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const allCookies = cookieStore.getAll();
        const authCookies = allCookies.filter((c) => c.name.includes(BETTER_AUTH_COOKIE_PREFIX));
        cookieHeader = authCookies.map((c) => `${c.name}=${c.value}`).join('; ');
      }
    } catch {
      // Not in a server component context, skip cookie forwarding
    }
  }

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(cookieHeader && { Cookie: cookieHeader }),
    ...(process.env.INKEEP_AGENTS_API_BYPASS_SECRET && {
      Authorization: `Bearer ${process.env.INKEEP_AGENTS_API_BYPASS_SECRET}`,
    }),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: defaultHeaders,
      // Disable Next.js caching to always get fresh data
      cache: 'no-store',
    });

    if (!response.ok) {
      let errorData: any;
      try {
        const text = await response.text();
        errorData = text ? JSON.parse(text) : null;
      } catch {
        errorData = null;
      }

      // Handle Zod validation errors (400 status with errors array)
      if (response.status === 400 && errorData?.errors && Array.isArray(errorData.errors)) {
        const validationErrors = errorData.errors
          .map(
            (err: any) =>
              `${err.name || err.pointer || 'field'}: ${err.detail || err.reason || err.message}`
          )
          .join(', ');
        const errorMessage = `Validation failed: ${validationErrors}`;

        console.error('API Validation Error Response:', {
          status: response.status,
          errorData,
          validationErrors,
        });

        throw new ApiError(
          {
            code: 'validation_error',
            message: errorMessage,
          },
          response.status
        );
      }

      const errorMessage =
        errorData?.error?.message ||
        errorData?.message ||
        errorData?.detail ||
        `HTTP ${response.status}: ${response.statusText}` ||
        'Unknown error occurred';

      const errorCode = errorData?.error?.code || errorData?.code || 'unknown';

      console.error('API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        errorMessage,
        errorCode,
      });

      throw new ApiError(
        {
          code: errorCode,
          message: errorMessage,
        },
        response.status
      );
    }

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
  return makeApiRequestInternal<T>(getAgentsApiUrl(), `manage/${endpoint}`, options);
}
