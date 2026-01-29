/**
 * Utility functions for handling authentication redirects.
 * Provides consistent login URL building with return URL support.
 */

/**
 * Builds a login URL with an optional return URL parameter.
 * After successful login, the user will be redirected to the return URL.
 *
 * @param returnUrl - The URL to redirect to after login (optional)
 * @returns The login URL with encoded return URL parameter
 */
function buildLoginUrl(returnUrl?: string): string {
  const loginPath = '/login';

  if (!returnUrl) {
    return loginPath;
  }

  const encodedReturnUrl = encodeURIComponent(returnUrl);
  return `${loginPath}?returnUrl=${encodedReturnUrl}`;
}

/**
 * Gets the current URL path for use as a return URL.
 * Works only on the client side.
 *
 * @returns The current pathname and search string, or undefined if on server
 */
function getCurrentPath(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.location.pathname + window.location.search;
}

/**
 * Builds a login URL with the current page as the return URL.
 * Works only on the client side.
 *
 * @returns The login URL with the current path as return URL
 */
export function buildLoginUrlWithCurrentPath(): string {
  const currentPath = getCurrentPath();
  return buildLoginUrl(currentPath);
}

/**
 * Trusted origins for OAuth redirects.
 * These are allowed in addition to relative paths for the OAuth flow.
 */
const TRUSTED_ORIGINS = [
  'http://localhost:3002', // manage-api local
  'http://localhost:3001', // run-api local
  process.env.NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL,
  process.env.NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL,
].filter(Boolean) as string[];

/**
 * Validates a return URL to ensure it's safe to redirect to.
 * Allows:
 * - Relative paths (starting with /)
 * - Full URLs to trusted origins (for OAuth flows between manage-ui and manage-api)
 *
 * @param returnUrl - The return URL to validate
 * @returns Whether the return URL is safe to use
 */
export function isValidReturnUrl(returnUrl: string | null | undefined): returnUrl is string {
  if (!returnUrl) {
    return false;
  }

  // Allow relative paths (most common case)
  if (returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
    // Reject URLs that try to break out with encoded characters
    try {
      const decoded = decodeURIComponent(returnUrl);
      if (decoded.startsWith('//') || decoded.includes('://')) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  // Allow full URLs to trusted origins (for OAuth flows)
  // This is needed for the manage-api OAuth flow where we redirect back
  // to the authorize endpoint after login in manage-ui
  try {
    const url = new URL(returnUrl);
    const origin = url.origin;
    if (TRUSTED_ORIGINS.includes(origin)) {
      return true;
    }
  } catch {
    // Invalid URL format
    return false;
  }

  return false;
}

/**
 * Gets a safe return URL from a search param value.
 * Returns the returnUrl if valid, or the fallback (default '/').
 *
 * @param returnUrl - The return URL from search params
 * @param fallback - The fallback URL if returnUrl is invalid
 * @returns A safe URL to redirect to
 */
export function getSafeReturnUrl(returnUrl: string | null | undefined, fallback = '/'): string {
  return isValidReturnUrl(returnUrl) ? returnUrl : fallback;
}
