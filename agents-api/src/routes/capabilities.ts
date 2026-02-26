import { OpenAPIHono, z } from '@hono/zod-openapi';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { manageApiKeyOrSessionAuth } from '../middleware';
import type { AppVariables } from '../types';

export const capabilitiesHandler = new OpenAPIHono<{ Variables: AppVariables }>();

const CapabilitiesResponseSchema = z
  .object({
    sandbox: z
      .object({
        configured: z
          .boolean()
          .describe(
            'Whether a sandbox provider is configured. Required for Function Tools execution.'
          ),
        provider: z
          .enum(['native', 'vercel'])
          .optional()
          .describe('The configured sandbox provider, if enabled.'),
        runtime: z
          .enum(['node22', 'typescript'])
          .optional()
          .describe('The configured sandbox runtime, if enabled.'),
      })
      .describe('Sandbox execution capabilities (used by Function Tools).'),
  })
  .describe('Optional server capabilities and configuration.')
  .openapi('CapabilitiesResponseSchema');

capabilitiesHandler.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    operationId: 'capabilities',
    summary: 'Get server capabilities',
    description: 'Get information about optional server-side capabilities and configuration.',
    permission: manageApiKeyOrSessionAuth(),
    responses: {
      200: {
        description: 'Server capabilities',
        content: {
          'application/json': {
            schema: CapabilitiesResponseSchema,
          },
        },
      },
    },
  }),
  (c) => {
    const sandboxConfig = c.get('sandboxConfig');
    if (!sandboxConfig) {
      return c.json({ sandbox: { configured: false } });
    }
    return c.json({
      sandbox: {
        configured: true,
        provider: sandboxConfig.provider,
        runtime: sandboxConfig.runtime,
      },
    });
  }
);
