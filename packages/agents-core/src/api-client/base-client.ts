/**
 * Shared base API client for making HTTP requests
 * Used by both CLI and SDK to ensure consistent API communication
 *
 * This is a thin wrapper around fetch that provides consistent header handling.
 * Implementations should construct Authorization headers and pass them via options.
 */

/**
 * Makes an HTTP request with consistent header defaults
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options (headers will be merged with defaults)
 * @returns Promise<Response>
 *
 * @example
 * ```typescript
 * // With Authorization header
 * const response = await apiFetch('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: {
 *     Authorization: 'Bearer your-api-key'
 *   },
 *   body: JSON.stringify({ data: 'value' })
 * });
 *
 * // Without Authorization
 * const response = await apiFetch('https://api.example.com/public', {
 *   method: 'GET'
 * });
 * ```
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
