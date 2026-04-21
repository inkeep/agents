import { isSessionCookie } from '@inkeep/agents-core/auth/cookie-names';
import { isDevelopment } from '@inkeep/agents-core/utils/env-detection';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRuntimeConfig } from '@/lib/runtime-config/get-runtime-config';

const runtimeConfig = getRuntimeConfig();

function toWebSocketOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;

  try {
    const url = new URL(origin);

    if (url.protocol === 'https:') {
      url.protocol = 'wss:';
      return url.origin;
    }

    if (url.protocol === 'http:') {
      url.protocol = 'ws:';
      return url.origin;
    }

    return null;
  } catch {
    return null;
  }
}

function buildCsp() {
  // PostHog Cloud may use multiple changing subdomains; keep CSP aligned with:
  // https://posthog.com/docs/advanced/content-security-policy
  const posthogHost = runtimeConfig.PUBLIC_POSTHOG_HOST ? 'https://*.posthog.com' : null;

  const connectSrcDomains = [
    "'self'",
    runtimeConfig.PUBLIC_INKEEP_AGENTS_API_URL,
    posthogHost,
    process.env.NEXT_PUBLIC_SENTRY_DSN ? 'https://*.sentry.io' : null,
    runtimeConfig.PUBLIC_SIGNOZ_URL,
    runtimeConfig.PUBLIC_NANGO_SERVER_URL,
    toWebSocketOrigin(runtimeConfig.PUBLIC_NANGO_SERVER_URL),
    runtimeConfig.PUBLIC_NANGO_CONNECT_BASE_URL,
  ]
    .filter(Boolean)
    .join(' ');

  const frameSrcDomains = [
    "'self'",
    runtimeConfig.PUBLIC_NANGO_CONNECT_BASE_URL,
    'https://accounts.google.com',
  ]
    .filter(Boolean)
    .join(' ');

  const scriptSrcDomains = [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    "'unsafe-eval'",
    posthogHost,
  ]
    .filter(Boolean)
    .join(' ');

  return [
    `default-src 'self'`,
    `script-src ${scriptSrcDomains}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' https: data:`,
    `connect-src ${connectSrcDomains}`,
    `frame-src ${frameSrcDomains}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', buildCsp());
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-XSS-Protection', '0');
  return response;
}

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
  const returnPath = request.nextUrl.pathname + request.nextUrl.search;
  if (returnPath !== '/') {
    loginUrl.searchParams.set('returnUrl', returnPath);
  }
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /:tenantId/projects/:projectId → /:tenantId/projects/:projectId/agents
  // Handled here instead of next.config.ts redirects() so security headers are applied.
  const projectRedirectMatch = pathname.match(/^\/([^/]+)\/projects\/([^/]+)$/);
  if (projectRedirectMatch && !pathname.endsWith('/agents')) {
    const redirectUrl = new URL(`${pathname}/agents`, request.url);
    redirectUrl.search = request.nextUrl.search;
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 307));
  }

  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const hasSession = request.cookies.getAll().some((c) => isSessionCookie(c.name));

  if (hasSession) {
    if (request.cookies.has(LOGGED_OUT_COOKIE)) {
      const response = NextResponse.next();
      response.cookies.delete(LOGGED_OUT_COOKIE);
      return applySecurityHeaders(response);
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (isDevelopment()) {
    if (request.cookies.has(LOGGED_OUT_COOKIE)) {
      return applySecurityHeaders(redirectToLogin(request));
    }

    const session = await tryDevAutoLogin();
    if (session) {
      const response = NextResponse.next();
      response.headers.set('set-cookie', session);
      return applySecurityHeaders(response);
    }
  }

  return applySecurityHeaders(redirectToLogin(request));
}

async function tryDevAutoLogin(): Promise<string | null> {
  const apiUrl = runtimeConfig.PUBLIC_INKEEP_AGENTS_API_URL;
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
