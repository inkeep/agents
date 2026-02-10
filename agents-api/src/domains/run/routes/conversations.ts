import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type FullExecutionContext,
  listConversations,
  lookupResources,
  SpiceDbConversationPermissions,
  SpiceDbResourceTypes,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { isAnonymousRequest } from '../utils/anonymous-user';

type AppVariables = {
  executionContext: FullExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('runConversations');

const listConversationsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Conversations'],
  summary: 'List conversations',
  description: 'Returns conversations for the authenticated user or anonymous user.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().min(1).default(1).optional(),
      limit: z.coerce.number().min(1).max(100).default(20).optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of conversations',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              conversations: z.array(z.any()),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
            }),
          }),
        },
      },
    },
  },
});

app.openapi(listConversationsRoute, async (c) => {
  const executionContext = c.get('executionContext');
  const { tenantId, projectId } = executionContext;
  const { page = 1, limit = 20 } = c.req.valid('query');

  const isAnon = isAnonymousRequest(executionContext);
  const anonymousUserId = executionContext.metadata?.anonymousUserId as string | undefined;

  logger.info(
    { tenantId, projectId, page, limit, isAnon, anonymousUserId },
    'Listing conversations'
  );

  if (isAnon && anonymousUserId) {
    let conversationIds: string[] = [];
    try {
      conversationIds = await lookupResources({
        resourceType: SpiceDbResourceTypes.CONVERSATION,
        permission: SpiceDbConversationPermissions.VIEW,
        subjectType: SpiceDbResourceTypes.ANONYMOUS_USER,
        subjectId: anonymousUserId,
      });
    } catch (err) {
      logger.warn(
        { err, anonymousUserId },
        'SpiceDB lookupResources failed, falling back to DB query'
      );
    }

    const queryParams =
      conversationIds.length > 0
        ? { scopes: { tenantId, projectId }, conversationIds, pagination: { page, limit } }
        : { scopes: { tenantId, projectId }, anonymousUserId, pagination: { page, limit } };

    const result = await listConversations(runDbClient)(queryParams);

    return c.json({
      data: {
        conversations: result.conversations,
        total: result.total,
        page,
        limit,
      },
    });
  }

  const result = await listConversations(runDbClient)({
    scopes: { tenantId, projectId },
    pagination: { page, limit },
  });

  return c.json({
    data: {
      conversations: result.conversations,
      total: result.total,
      page,
      limit,
    },
  });
});

export default app;
