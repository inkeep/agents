export const AUTH_COOKIE_PREFIX = 'better-auth';

export const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;

export function isAuthCookie(cookieName: string): boolean {
  return cookieName.includes(AUTH_COOKIE_PREFIX);
}

export function isSessionCookie(cookieName: string): boolean {
  return cookieName.endsWith(SESSION_COOKIE_NAME);
}
