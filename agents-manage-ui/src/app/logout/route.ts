import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getManageApiUrl } from '@/lib/api/api-config';

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

/**
 * GET /logout
 *
 * Debug endpoint to log out by visiting a URL directly.
 * Clears better-auth session cookies and redirects to login.
 */
export async function GET(request: Request) {
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
    console.error('Failed to call sign-out endpoint:', error);
  }

  // Determine the redirect URL (support custom redirect via query param)
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get('redirect') || '/login';

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
