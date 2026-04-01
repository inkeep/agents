import { timingSafeEqual } from 'node:crypto';
import { createApiError } from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import { env } from '../../env';

export const slackMcpAuth = () =>
  createMiddleware<{
    Variables: {
      toolId: string;
      tenantId: string;
      projectId: string;
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

    if (!env.SLACK_MCP_API_KEY) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Slack MCP API key not configured',
      });
    }

    const expectedKey = Buffer.from(env.SLACK_MCP_API_KEY);
    const providedKey = Buffer.from(apiKey);

    if (expectedKey.length !== providedKey.length || !timingSafeEqual(expectedKey, providedKey)) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Invalid API key',
      });
    }

    c.set('toolId', toolId);
    c.set('tenantId', tenantId);
    c.set('projectId', projectId);
    await next();
  });
