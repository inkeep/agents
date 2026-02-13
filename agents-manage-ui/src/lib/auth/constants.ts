/**
 * Better Auth cookie name constants.
 *
 * These follow the pattern: better-auth.{cookie_name}
 * Used across the app for auth checks, cookie forwarding, and logout cleanup.
 */

/** The session token cookie — presence indicates an active session. */
export const BETTER_AUTH_SESSION_TOKEN_COOKIE = 'better-auth.session_token';

/** Common prefix shared by all Better Auth cookies. */
export const BETTER_AUTH_COOKIE_PREFIX = 'better-auth';

/**
 * All known Better Auth cookie names.
 * Used by the logout route to ensure complete cookie cleanup.
 */
export const BETTER_AUTH_COOKIES = [
  BETTER_AUTH_SESSION_TOKEN_COOKIE,
  'better-auth.session_data',
  'better-auth.dont_remember',
  'better-auth.two_factor',
] as const;
