export const AUTH_COOKIE_PREFIX = 'better-auth';

const SECURE_PREFIX = '__Secure-';

export const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;

export function isAuthCookie(cookieName: string): boolean {
  return (
    cookieName.startsWith(AUTH_COOKIE_PREFIX) ||
    cookieName.startsWith(`${SECURE_PREFIX}${AUTH_COOKIE_PREFIX}`)
  );
}

export function isSessionCookie(cookieName: string): boolean {
  return (
    cookieName === SESSION_COOKIE_NAME || cookieName === `${SECURE_PREFIX}${SESSION_COOKIE_NAME}`
  );
}
