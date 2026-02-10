import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type AnonymousTokenPayload,
  isAnonymousToken,
  listConversations,
  lookupResources,
  SpiceDbConversationPermissions,
  SpiceDbResourceTypes,
  verifyAnonymousToken,
} from '@inkeep/agents-core';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const app = new OpenAPIHono();
const logger = getLogger('anonymousConversations');

async function extractAnonymousUser(
  authHeader: string | undefined
): Promise<AnonymousTokenPayload> {
  if (!authHeader?.startsWith('Bearer ')) {
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

  return result.payload;
}

const listConversationsRoute = createRoute({
  method: 'get',
  path: '/conversations',
  tags: ['Anonymous Conversations'],
  summary: 'List conversations for anonymous user',
  description: 'Returns conversations the anonymous user participated in, authorized via SpiceDB.',
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
  const anonUser = await extractAnonymousUser(c.req.header('Authorization'));
  const { anonymousUserId, tenantId, projectId } = anonUser;
  const { page = 1, limit = 20 } = c.req.valid('query');

  logger.info(
    { anonymousUserId, tenantId, projectId, page, limit },
    'Listing anonymous conversations'
  );

  let conversationIds: string[];
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
    conversationIds = [];
  }

  if (conversationIds.length === 0) {
    const result = await listConversations(runDbClient)({
      scopes: { tenantId, projectId },
      anonymousUserId,
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
  }

  const result = await listConversations(runDbClient)({
    scopes: { tenantId, projectId },
    conversationIds,
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
