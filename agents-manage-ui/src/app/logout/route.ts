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

export function computeCandidateDomains(hostname: string): (string | undefined)[] {
  const domains: (string | undefined)[] = [undefined];

  if (hostname === 'localhost' || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    return domains;
  }

  const parts = hostname.split('.');
  if (parts.length < 2) {
    return domains;
  }

  let domainParts: string[];
  if (parts.length === 3) {
    domainParts = parts;
  } else if (parts.length > 3) {
    domainParts = parts.slice(1);
  } else {
    domainParts = parts;
  }
  const autoComputed = `.${domainParts.join('.')}`;
  domains.push(autoComputed);

  if (parts.length > 2) {
    const rootDomain = `.${parts.slice(-2).join('.')}`;
    if (rootDomain !== autoComputed) {
      domains.push(rootDomain);
    }
  }

  return domains;
}

export function buildClearCookieHeader(name: string, isSecure: boolean, domain?: string): string {
  const parts = [
    `${name}=`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
  ];
  if (isSecure) {
    parts.push('SameSite=None', 'Secure');
  } else {
    parts.push('SameSite=Lax');
  }
  if (domain) {
    parts.push(`Domain=${domain}`);
  }
  return parts.join('; ');
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

  const requestUrl = new URL(request.url);
  const hostname = requestUrl.hostname;
  const candidateDomains = computeCandidateDomains(hostname);

  const isDev = process.env.ENVIRONMENT === 'development' || process.env.NODE_ENV === 'development';
  if (isDev) {
    response.cookies.set('dev-logged-out', '1', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: false,
      maxAge: 24 * 60 * 60,
    });
  }

  for (const cookieName of cookiesToClear) {
    for (const domain of candidateDomains) {
      response.headers.append('Set-Cookie', buildClearCookieHeader(cookieName, isSecure, domain));
    }
  }

  return response;
}
