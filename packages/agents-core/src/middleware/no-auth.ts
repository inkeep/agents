import { createMiddleware } from 'hono/factory';

export const noAuth = () => {
  return createMiddleware(async (_c, next) => {
    await next();
  });
};
