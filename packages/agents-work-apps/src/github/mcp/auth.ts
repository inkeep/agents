import { createApiError } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { env } from '../../env';

export const githubMcpAuth = () =>
  createMiddleware<{
    Variables: {
      toolId: string;
    };
  }>(async (c, next) => {
    const toolId = c.req.header('x-inkeep-tool-id');
    if (!toolId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing required header: x-inkeep-tool-id',
        extensions: {
          parameter: {
            in: 'header',
            name: 'x-inkeep-tool-id',
          },
        },
      });
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing required header: Authorization',
        extensions: {
          parameter: {
            in: 'header',
            name: 'Authorization',
          },
        },
      });
    }

    const apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    if (!apiKey) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Invalid Authorization header format. Expected: Bearer <token>',
        extensions: {
          parameter: {
            in: 'header',
            name: 'Authorization',
          },
        },
      });
    }

    if (apiKey !== env.GITHUB_MCP_API_KEY) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Invalid API key',
      });
    }

    c.set('toolId', toolId);
    await next();
  });
