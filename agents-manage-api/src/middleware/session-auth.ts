import { createApiError } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

export const sessionAuth = () =>
  createMiddleware(async (c, next) => {
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
