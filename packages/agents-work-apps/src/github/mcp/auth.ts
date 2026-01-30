import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { env } from '../../env';

export const githubMcpAuth = () =>
  createMiddleware<{
    Variables: {
      toolId: string;
    };
  }>(async (c, next) => {
    const toolId = c.req.header('x-inkeep-tool-id');
    if (!toolId) {
      throw new HTTPException(401, { message: 'x-inkeep-tool-id header is required' });
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      throw new HTTPException(401, { message: 'Authorization header is required' });
    }

    const apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    if (!apiKey) {
      throw new HTTPException(401, { message: 'Invalid API key' });
    }

    if (apiKey !== env.GITHUB_MCP_API_KEY) {
      throw new HTTPException(401, { message: 'Invalid API key' });
    }

    c.set('toolId', toolId);
    await next();
  });
