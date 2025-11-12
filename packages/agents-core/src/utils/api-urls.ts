/**
 * Utility functions for resolving API URLs from environment variables
 *
 * These functions provide a consistent way to get API URLs based on context.
 */

export type ApiUrlContext = 'server' | 'client';

/**
 * Get the Manage API URL based on context
 *
 * @param context - 'server' for server-side usage, 'client' for browser/client-side usage
 * @param defaultUrl - Optional default URL (defaults to http://localhost:3002)
 * @returns The resolved API URL
 *
 * @example
 * ```typescript
 * // Server-side usage
 * const url = getManageApiUrl('server');
 *
 * // Client-side usage (browser)
 * const url = getManageApiUrl('client');
 * ```
 */
export function getManageApiUrl(
  context: ApiUrlContext = 'server',
  defaultUrl: string = 'http://localhost:3002'
): string {
  if (context === 'client') {
    return (
      process.env.PUBLIC_INKEEP_AGENTS_MANAGE_API_URL ||
      process.env.INKEEP_AGENTS_MANAGE_API_URL ||
      defaultUrl
    );
  }

  return process.env.INKEEP_AGENTS_MANAGE_API_URL || defaultUrl;
}

/**
 * Get the Run API URL based on context
 *
 * @param context - 'server' for server-side usage, 'client' for browser/client-side usage
 * @param defaultUrl - Optional default URL (defaults to http://localhost:3003)
 * @returns The resolved API URL
 *
 * @example
 * ```typescript
 * // Server-side usage
 * const url = getRunApiUrl('server');
 *
 * // Client-side usage (browser)
 * const url = getRunApiUrl('client');
 * ```
 */
export function getRunApiUrl(
  context: ApiUrlContext = 'server',
  defaultUrl: string = 'http://localhost:3003'
): string {
  if (context === 'client') {
    return (
      process.env.PUBLIC_INKEEP_AGENTS_RUN_API_URL ||
      process.env.INKEEP_AGENTS_RUN_API_URL ||
      defaultUrl
    );
  }

  return process.env.INKEEP_AGENTS_RUN_API_URL || defaultUrl;
}

