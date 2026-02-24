import { createApiError } from '@inkeep/agents-core';
import { registerAuthzMeta } from '@inkeep/agents-core/middleware';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

/**
 * Middleware to enforce session-based authentication.
 * Requires that a user has already been authenticated via Better Auth session.
 * Used primarily for manage routes that require an active user session.
 */
export const sessionAuth = () => {
  const mw = createMiddleware(async (c, next) => {
    try {
      const user = c.get('user');

      if (!user) {
        throw createApiError({
          code: 'unauthorized',
          message: 'Please log in to access this resource',
        });
      }

      c.set('userId', user.id);
      c.set('userEmail', user.email);

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      throw createApiError({
        code: 'unauthorized',
        message: 'Authentication failed',
      });
    }
  });
  registerAuthzMeta(mw, {
    description: 'Requires an active user session (cookie-based)',
  });
  return mw;
};

/**
 * Global session middleware - sets user and session in context for all routes
 * Used for all routes that require an active user session.
 */
export const sessionContext = () =>
  createMiddleware(async (c, next) => {
    const auth = c.get('auth');
    if (!auth) {
      c.set('user', null);
      c.set('session', null);
      await next();
      return;
    }

    // Create headers with x-forwarded-cookie mapped to cookie (browsers forbid setting Cookie header directly)
    const headers = new Headers(c.req.raw.headers);
    const forwardedCookie = headers.get('x-forwarded-cookie');
    if (forwardedCookie && !headers.get('cookie')) {
      headers.set('cookie', forwardedCookie);
    }

    const session = await auth.api.getSession({ headers });

    if (!session) {
      c.set('user', null);
      c.set('session', null);
      await next();
      return;
    }

    c.set('user', session.user);
    c.set('session', session.session);
    await next();
  });
