import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

export const noAuth = (): MiddlewareHandler => {
  return createMiddleware(async (_c, next) => {
    await next();
  });
};
