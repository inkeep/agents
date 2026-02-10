import {
  type AnonymousTokenPayload,
  isAnonymousToken,
  verifyAnonymousToken,
} from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

export interface AnonymousAuthVariables {
  anonymousUser: AnonymousTokenPayload;
}

export const requireAnonymousAuth = () =>
  createMiddleware<{
    Variables: AnonymousAuthVariables;
  }>(async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing anonymous token' });
    }

    const token = authHeader.substring(7);
    if (!isAnonymousToken(token)) {
      throw new HTTPException(401, { message: 'Invalid token format' });
    }

    const result = await verifyAnonymousToken(token);
    if (!result.valid) {
      throw new HTTPException(401, { message: result.error });
    }

    c.set('anonymousUser', result.payload);
    await next();
  });

export const optionalAnonymousAuth = () =>
  createMiddleware<{
    Variables: {
      anonymousUser?: AnonymousTokenPayload;
    };
  }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await next();
      return;
    }

    const token = authHeader.substring(7);
    if (!isAnonymousToken(token)) {
      await next();
      return;
    }

    const result = await verifyAnonymousToken(token);
    if (result.valid) {
      c.set('anonymousUser', result.payload);
    }

    await next();
  });
