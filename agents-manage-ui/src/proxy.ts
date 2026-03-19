import { isDevelopment } from '@inkeep/agents-core';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const SESSION_COOKIE_SUFFIX = 'better-auth.session_token';
const LOGGED_OUT_COOKIE = 'dev-logged-out';

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
  '/device',
  '/link',
  '/no-organization',
  '/oauth',
  '/github',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('returnUrl', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith(SESSION_COOKIE_SUFFIX));

  if (hasSession) {
    if (request.cookies.has(LOGGED_OUT_COOKIE)) {
      const response = NextResponse.next();
      response.cookies.delete(LOGGED_OUT_COOKIE);
      return response;
    }
    return NextResponse.next();
  }

  if (isDevelopment()) {
    if (request.cookies.has(LOGGED_OUT_COOKIE)) {
      return redirectToLogin(request);
    }

    const session = await tryDevAutoLogin();
    if (session) {
      const response = NextResponse.next();
      response.headers.set('set-cookie', session);
      return response;
    }
  }

  return redirectToLogin(request);
}

async function tryDevAutoLogin(): Promise<string | null> {
  const apiUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const bypassSecret = process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET;

  if (!bypassSecret) {
    console.warn(
      '[proxy] INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET is not set — dev auto-login will not work. ' +
        'Add it to your .env file.'
    );
    return null;
  }

  try {
    const res = await fetch(`${apiUrl}/api/auth/dev-session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bypassSecret}`,
      },
    });

    if (res.ok) {
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        return setCookie;
      }
      console.warn('[proxy] dev auto-login API returned 200 but no set-cookie header');
    } else {
      console.warn(
        `[proxy] dev auto-login failed (HTTP ${res.status}). Run \`pnpm db:auth:init\` to create dev credentials.`
      );
    }
  } catch (err) {
    console.warn('[proxy] dev auto-login fetch failed:', err);
  }

  return null;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|assets/|favicon\\.ico|manifest\\.json|api|monitoring).*)',
  ],
};
