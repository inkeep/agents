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
export function buildLoginUrl(returnUrl?: string): string {
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
export function getCurrentPath(): string | undefined {
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
 * Validates a return URL to ensure it's safe to redirect to.
 * Only allows relative paths (starting with /) to prevent open redirect vulnerabilities.
 *
 * @param returnUrl - The return URL to validate
 * @returns Whether the return URL is safe to use
 */
export function isValidReturnUrl(returnUrl: string | null | undefined): returnUrl is string {
  if (!returnUrl) {
    return false;
  }

  // Must start with / (relative path)
  if (!returnUrl.startsWith('/')) {
    return false;
  }

  // Reject protocol-relative URLs (//example.com)
  if (returnUrl.startsWith('//')) {
    return false;
  }

  // Reject URLs that try to break out with encoded characters
  try {
    const decoded = decodeURIComponent(returnUrl);
    if (decoded.startsWith('//') || decoded.includes('://')) {
      return false;
    }
  } catch {
    // If decoding fails, reject the URL
    return false;
  }

  return true;
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
