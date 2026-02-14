import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  canUseProject,
  createApiError,
  ErrorResponseSchema,
  getAgentById,
  type OrgRole,
  projectExists,
  signTempToken,
  TenantParamsSchema,
} from '@inkeep/agents-core';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';

const logger = getLogger('playgroundToken');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const PlaygroundTokenRequestSchema = z.object({
  projectId: z.string(),
  agentId: z.string(),
});

const PlaygroundTokenResponseSchema = z.object({
  apiKey: z.string().describe('Temporary API key for playground use'),
  expiresAt: z.string().describe('ISO 8601 timestamp when the key expires'),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Generate temporary API key for playground',
    operationId: 'create-playground-token',
    tags: ['API Keys'],
    description:
      'Generates a short-lived API key (1 hour expiry) for authenticated users to access the run-api from the playground',
    security: [{ cookieAuth: [] }],
    request: {
      params: TenantParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: PlaygroundTokenRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Temporary API key generated successfully',
        content: {
          'application/json': {
            schema: PlaygroundTokenResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized - session required',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    const userId = c.get('userId');
    const tenantId = c.get('tenantId'); // Set by requireTenantAccess middleware from URL param
    const tenantRole = (c.get('tenantRole') || 'member') as OrgRole;
    const { projectId, agentId } = c.req.valid('json');

    if (!userId || !tenantId || !projectId || !agentId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User, tenant, project, or agent ID not found',
      });
    }

    logger.info(
      { userId, tenantId, projectId, agentId },
      'Generating temporary JWT token for playground'
    );

    // Check SpiceDB 'use' permission for this project
    // This allows project_admin and project_member roles, but not project_viewer
    const canUse = await canUseProject({
      userId,
      tenantId,
      projectId,
      orgRole: tenantRole,
    });

    if (!canUse) {
      logger.warn({ userId, tenantId, projectId }, 'User does not have use permission on project');
      throw createApiError({
        code: 'not_found',
        message: 'Project not found',
      });
    }

    // Verify project exists and belongs to the tenant
    const projectExistsCheck = await projectExists(db)({ tenantId, projectId });
    if (!projectExistsCheck) {
      logger.warn({ userId, tenantId, projectId }, 'Project not found or access denied');
      throw createApiError({
        code: 'not_found',
        message: 'Project not found',
      });
    }

    // Verify agent exists and belongs to the project
    const agent = await getAgentById(db)({ scopes: { tenantId, projectId, agentId } });
    if (!agent) {
      logger.warn({ userId, tenantId, projectId, agentId }, 'Agent not found or access denied');
      throw createApiError({
        code: 'not_found',
        message: 'Agent not found',
      });
    }

    if (!env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Temporary token signing not configured',
      });
    }

    const privateKeyPem = Buffer.from(env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY, 'base64').toString(
      'utf-8'
    );

    const result = await signTempToken(privateKeyPem, {
      tenantId,
      projectId,
      agentId,
      type: 'temporary',
      initiatedBy: { type: 'user', id: userId },
      sub: userId,
    });

    logger.info({ userId, expiresAt: result.expiresAt }, 'Temporary JWT token generated');

    return c.json(
      {
        apiKey: result.token,
        expiresAt: result.expiresAt,
      },
      200
    );
  }
);

export default app;
