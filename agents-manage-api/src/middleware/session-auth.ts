import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

export const sessionAuth = () =>
  createMiddleware(async (c, next) => {
    try {
      const user = c.get('user');

      if (!user) {
        throw new HTTPException(401, {
          message: 'Unauthorized - Please log in',
        });
      }

      c.set('userId', user.id);
      c.set('userEmail', user.email);

      await next();
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(401, {
        message: 'Authentication failed',
      });
    }
  });
