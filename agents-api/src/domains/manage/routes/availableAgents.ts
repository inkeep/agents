import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createApiError,
  listAgentsAcrossProjectMainBranches,
  listUsableProjectIds,
  verifyTempToken,
} from '@inkeep/agents-core';
import manageDbClient from '../../../data/db/manageDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';

const logger = getLogger('availableAgents');

const app = new OpenAPIHono();

// ============================================================================
// Token Verification Strategies
// ============================================================================

/**
 * Result from successful user identification
 */
interface IdentifiedUser {
  userId: string;
  tenantId: string;
  tokenType: string;
}

async function tryTempTokenAuth(token: string): Promise<IdentifiedUser | null> {
  if (!env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY) {
    return null;
  }

  try {
    const publicKeyPem = Buffer.from(env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY, 'base64').toString(
      'utf-8'
    );
    const payload = await verifyTempToken(publicKeyPem, token);

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      tokenType: 'temp-jwt',
    };
  } catch (error) {
    logger.warn({ token, error }, 'Failed to verify temp token');
    return null;
  }
}

// ============================================================================
// Add Slack / Work-app user token verification here
// ============================================================================
//
// Example implementation:
//
// async function trySlackUserTokenAuth(token: string): Promise<IdentifiedUser | null> {
//   if (!isSlackUserToken(token)) {
//     return null;
//   }
//
//   const result = await verifySlackUserToken(token);
//   if (!result.valid || !result.payload) {
//     return null;
//   }
//
//   return {
//     userId: result.payload.sub,
//     tenantId: result.payload.tenantId,
//     tokenType: 'slack-user-jwt',
//   };
// }
//
// ============================================================================

/**
 * Identify user from any supported token type
 * Add new token types by adding them to this function
 */
async function identifyUserFromToken(token: string): Promise<IdentifiedUser | null> {
  // 1. Try temp JWT (playground tokens)
  const tempResult = await tryTempTokenAuth(token);
  if (tempResult) return tempResult;

  // 2. Add Slack/ Work- app token auth here, for example:
  // const slackResult = await trySlackUserTokenAuth(token);
  // if (slackResult) return slackResult;

  return null;
}

// ============================================================================
// Route Definition
// ============================================================================

const AvailableAgentSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  projectId: z.string(),
});

const AvailableAgentsResponseSchema = z.object({
  data: z.array(AvailableAgentSchema),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List available agents',
    operationId: 'list-available-agents',
    tags: ['Agents'],
    description: 'List all agents the user can invoke. Requires a valid JWT token.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'List of available agents',
        content: {
          'application/json': {
            schema: AvailableAgentsResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized - invalid or missing JWT token',
      },
      500: {
        description: 'Internal server error',
      },
    },
  }),
  async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Missing or invalid authorization header. Expected: Bearer <jwt_token>',
      });
    }

    const token = authHeader.substring(7);
    if (!token.startsWith('eyJ')) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Invalid token format. Expected a JWT token.',
      });
    }

    // Identify user from token (supports multiple token types)
    const user = await identifyUserFromToken(token);
    if (!user) {
      logger.warn({}, 'Token verification failed - no valid auth method found');
      throw createApiError({
        code: 'unauthorized',
        message: 'Invalid or expired token',
      });
    }

    const { userId, tenantId } = user;

    // Get list of project IDs the user can use (SpiceDB lookup)
    const projectIds = await listUsableProjectIds({ userId });

    if (projectIds.length === 0) {
      return c.json({ data: [] });
    }

    // Fetch agents across all usable project branches
    const agents = await listAgentsAcrossProjectMainBranches(manageDbClient, {
      tenantId,
      projectIds,
    });

    logger.info({ userId, tenantId, agentCount: agents.length }, 'Returning usable agents');

    return c.json({ data: agents });
  }
);

export default app;
