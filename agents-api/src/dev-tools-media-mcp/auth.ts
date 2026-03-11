import { createApiError, extractBearerToken, verifyMcpAccessToken } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';

export const devToolsMediaMcpAuth = () =>
  createMiddleware<{
    Variables: {
      tenantId: string;
      projectId: string;
    };
  }>(async (c, next) => {
    const tenantId = c.req.header('x-inkeep-tenant-id');
    if (!tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing required header: x-inkeep-tenant-id',
        extensions: {
          parameter: {
            in: 'header',
            name: 'x-inkeep-tenant-id',
          },
        },
      });
    }

    const projectId = c.req.header('x-inkeep-project-id');
    if (!projectId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing required header: x-inkeep-project-id',
        extensions: {
          parameter: {
            in: 'header',
            name: 'x-inkeep-project-id',
          },
        },
      });
    }

    const authHeader = c.req.header('Authorization');
    const { token, error: extractError } = extractBearerToken(authHeader);

    if (!token) {
      throw createApiError({
        code: 'unauthorized',
        message: extractError || 'Missing Authorization header',
        extensions: {
          parameter: {
            in: 'header',
            name: 'Authorization',
          },
        },
      });
    }

    const result = await verifyMcpAccessToken(token);

    if (!result.valid || !result.payload) {
      throw createApiError({
        code: 'unauthorized',
        message: result.error || 'Invalid token',
      });
    }

    if (result.payload.tenantId !== tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Token tenantId does not match header',
      });
    }

    if (result.payload.projectId !== projectId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Token projectId does not match header',
      });
    }

    c.set('tenantId', tenantId);
    c.set('projectId', projectId);
    await next();
  });
