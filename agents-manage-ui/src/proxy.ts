import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'better-auth.session_token';
const LOGGED_OUT_COOKIE = 'dev-logged-out';

export async function proxy(request: NextRequest) {
  if (process.env.ENVIRONMENT !== 'development' && process.env.NODE_ENV !== 'development') {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE)) {
    // Clean up stale dev-logged-out cookie when user has a valid session
    // (e.g. after manual re-login). This prevents the cookie from blocking
    // auto-login if the session later expires.
    if (request.cookies.has(LOGGED_OUT_COOKIE)) {
      const response = NextResponse.next();
      response.cookies.delete(LOGGED_OUT_COOKIE);
      return response;
    }
    return NextResponse.next();
  }

  if (request.cookies.has(LOGGED_OUT_COOKIE)) {
    return NextResponse.next();
  }

  const apiUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const bypassSecret = process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET;

  if (!bypassSecret) {
    console.warn(
      '[proxy] INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET is not set — dev auto-login will not work. ' +
        'Add it to your .env file.'
    );
    return NextResponse.next();
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
        const response = NextResponse.next();
        response.headers.set('set-cookie', setCookie);
        return response;
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|monitoring).*)'],
};
