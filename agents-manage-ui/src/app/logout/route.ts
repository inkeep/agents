import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { getManageApiUrl } from '@/lib/api/api-config';
import { getLogger } from '@/lib/logger';

/**
 * Known better-auth cookie names to clear.
 * These follow the pattern: better-auth.{cookie_name}
 */
const BETTER_AUTH_COOKIES = [
  'better-auth.session_token',
  'better-auth.session_data',
  'better-auth.dont_remember',
  'better-auth.two_factor',
];

const DEFAULT_REDIRECT = '/login';

/**
 * Validates that a redirect URL is safe (relative path only).
 * Prevents open redirect vulnerabilities.
 */
function isValidRedirect(redirect: string): boolean {
  // Must start with a single forward slash (relative path)
  if (!redirect.startsWith('/')) return false;

  // Prevent protocol-relative URLs (//evil.com)
  if (redirect.startsWith('//')) return false;

  // Prevent backslash tricks that some browsers interpret as protocol-relative
  if (redirect.includes('\\')) return false;

  return true;
}

/**
 * GET /logout
 *
 * Debug endpoint to log out by visiting a URL directly.
 * Clears better-auth session cookies and redirects to login.
 *
 * @param redirect - Optional query parameter for custom redirect URL (must be a relative path starting with /)
 * @example /logout
 * @example /logout?redirect=/dashboard
 */
export async function GET(request: NextRequest) {
  const logger = getLogger('logout');
  const cookieStore = await cookies();

  // Get all better-auth cookies to forward to the sign-out endpoint
  const allCookies = cookieStore.getAll();
  const authCookies = allCookies.filter((c) => c.name.includes('better-auth'));
  const cookieHeader = authCookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Call the better-auth sign-out endpoint on the manage API
  try {
    const manageApiUrl = getManageApiUrl();
    await fetch(`${manageApiUrl}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { Cookie: cookieHeader }),
      },
      credentials: 'include',
    });
  } catch (error) {
    // Log but don't fail - we'll still clear cookies locally
    // This ensures users can always log out even if the API is unavailable
    logger.warn({ error }, 'Failed to call sign-out endpoint, clearing cookies locally');
  }

  // Validate and determine the redirect URL
  const redirectParam = request.nextUrl.searchParams.get('redirect');
  const redirectTo =
    redirectParam && isValidRedirect(redirectParam) ? redirectParam : DEFAULT_REDIRECT;

  // Create redirect response
  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  // Clear all known better-auth cookies by setting them to expire immediately
  // This ensures cookies are cleared even if the server-side sign-out fails
  const cookiesToClear = new Set([
    ...BETTER_AUTH_COOKIES,
    ...authCookies.map((c) => c.name),
  ]);

  for (const cookieName of cookiesToClear) {
    // Clear cookie with path=/ to ensure we clear cookies set on root
    response.cookies.set(cookieName, '', {
      expires: new Date(0),
      path: '/',
    });
  }

  return response;
}

