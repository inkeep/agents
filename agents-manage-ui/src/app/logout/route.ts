import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { getAgentsApiUrl } from '@/lib/api/api-config';
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

  // Call the better-auth sign-out endpoint on the agents API
  try {
    const agentsApiUrl = getAgentsApiUrl();
    await fetch(`${agentsApiUrl}/manage/api/auth/sign-out`, {
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
  // We must match the attributes used when setting the cookies (Secure, SameSite, etc.)
  const cookiesToClear = new Set([...BETTER_AUTH_COOKIES, ...authCookies.map((c) => c.name)]);

  // Determine if request is secure (HTTPS) to match Secure cookie attribute
  const isSecure =
    request.url.startsWith('https://') || request.headers.get('x-forwarded-proto') === 'https';

  // Extract domain from request URL if needed (for cross-subdomain cookies)
  // This matches the logic in packages/agents-core/src/auth/auth.ts
  const requestUrl = new URL(request.url);
  let cookieDomain: string | undefined;
  const hostname = requestUrl.hostname;
  if (hostname !== 'localhost' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Extract parent domain for cross-subdomain cookie clearing
      // Matches auth.ts logic: 3 parts = all, 4+ parts = slice(1), 2 parts = all
      let domainParts: string[];
      if (parts.length === 3) {
        domainParts = parts;
      } else if (parts.length > 3) {
        domainParts = parts.slice(1);
      } else {
        domainParts = parts;
      }
      cookieDomain = `.${domainParts.join('.')}`;
    }
  }

  // Set dev-logged-out signal so the proxy skips auto-login after explicit logout.
  // Only set in dev mode — the proxy ignores this cookie in production.
  const isDev = process.env.ENVIRONMENT === 'development' || process.env.NODE_ENV === 'development';
  if (isDev) {
    response.cookies.set('dev-logged-out', '1', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      maxAge: 24 * 60 * 60, // 24 hours — self-heals if developer forgets
    });
  }

  for (const cookieName of cookiesToClear) {
    // Clear cookie with matching attributes to ensure browser removes it
    // Must include Secure if cookie was set with Secure, and SameSite to match
    response.cookies.set(cookieName, '', {
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      ...(isSecure
        ? { sameSite: 'none' as const, secure: true }
        : { sameSite: 'lax' as const, secure: false }),
      ...(cookieDomain && { domain: cookieDomain }),
    });
  }

  return response;
}
