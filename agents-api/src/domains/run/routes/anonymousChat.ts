import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type AnonymousTokenPayload,
  createAnonymousUser,
  createApiError,
  createMessage,
  createOrGetConversation,
  type FullExecutionContext,
  generateAnonymousToken,
  generateId,
  getActiveAgentForConversation,
  getConversationId,
  getFullProjectWithRelationIds,
  getProjectScopedRef,
  isAnonymousToken,
  type ResolvedRef,
  resolveRef,
  SpiceDbResourceTypes,
  setActiveAgentForConversation,
  verifyAnonymousToken,
  withRef,
  writeRelationship,
} from '@inkeep/agents-core';
import { streamSSE } from 'hono/streaming';
import manageDbClient from '../../../data/db/manageDbClient';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { ExecutionHandler } from '../handlers/executionHandler';
import type { ContentItem, Message } from '../types/chat';
import { errorOp } from '../utils/agent-operations';
import { createSSEStreamHelper } from '../utils/stream-helpers';

const app = new OpenAPIHono();
const logger = getLogger('anonymousChat');

async function resolveAnonymousRef(tenantId: string, projectId: string): Promise<ResolvedRef> {
  if (process.env.ENVIRONMENT === 'test') {
    const defaultBranchName = getProjectScopedRef(tenantId, projectId, 'main');
    return { type: 'branch', name: defaultBranchName, hash: 'test-hash' };
  }

  const projectMain = getProjectScopedRef(tenantId, projectId, 'main');
  const refResult = await resolveRef(manageDbClient)(projectMain);
  if (!refResult) {
    throw createApiError({
      code: 'not_found',
      message: `Project not found: ${projectId}`,
    });
  }
  return refResult;
}

async function buildAnonymousExecutionContext(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
}): Promise<FullExecutionContext> {
  const { tenantId, projectId, agentId } = params;

  const resolvedRef = await resolveAnonymousRef(tenantId, projectId);

  const projectConfig = await withRef(manageDbPool, resolvedRef, async (db) => {
    return await getFullProjectWithRelationIds(db)({
      scopes: { tenantId, projectId },
    });
  });

  if (!projectConfig) {
    throw createApiError({ code: 'not_found', message: 'Project not found' });
  }

  return {
    apiKey: '',
    apiKeyId: '',
    tenantId,
    projectId,
    agentId,
    baseUrl: '',
    project: projectConfig,
    resolvedRef,
  };
}

async function resolveOrCreateAnonymousUser(
  authHeader: string | undefined,
  tenantId: string,
  projectId: string
): Promise<{ payload: AnonymousTokenPayload; token: string; isNew: boolean }> {
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (isAnonymousToken(token)) {
      const result = await verifyAnonymousToken(token);
      if (result.valid) {
        return { payload: result.payload, token, isNew: false };
      }
    }
  }

  const anonymousUserId = `anon_${generateId()}`;
  await createAnonymousUser(runDbClient)({
    id: anonymousUserId,
    tenantId,
    projectId,
  });

  const token = await generateAnonymousToken({ anonymousUserId, tenantId, projectId });
  return {
    payload: { anonymousUserId, tenantId, projectId },
    token,
    isNew: true,
  };
}

const anonymousChatRoute = createRoute({
  method: 'post',
  path: '/tenants/:tenantId/projects/:projectId/agents/:agentId/chat/completions',
  tags: ['Anonymous Chat'],
  summary: 'Create anonymous chat completion',
  description:
    'Chat completions for anonymous (unauthenticated) end-users. Returns a JWE token on first request.',
  request: {
    params: z.object({
      tenantId: z.string(),
      projectId: z.string(),
      agentId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            messages: z.array(
              z.object({
                role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
                content: z.union([
                  z.string(),
                  z.array(z.strictObject({ type: z.string(), text: z.string().optional() })),
                ]),
                name: z.string().optional(),
              })
            ),
            conversationId: z.string().optional(),
            model: z.string().optional(),
            stream: z.boolean().optional(),
            temperature: z.number().optional(),
            max_tokens: z.number().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Streaming chat completion response',
      headers: z.object({
        'Content-Type': z.string().default('text/event-stream'),
        'x-anonymous-token': z.string().optional(),
      }),
      content: {
        'text/event-stream': {
          schema: z.string(),
        },
      },
    },
    404: {
      description: 'Agent not found',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
});

app.openapi(anonymousChatRoute, async (c) => {
  const { tenantId, projectId, agentId } = c.req.valid('param');

  logger.info({ tenantId, projectId, agentId }, 'Anonymous chat request');

  try {
    const {
      payload: anonUser,
      token: anonToken,
      isNew,
    } = await resolveOrCreateAnonymousUser(c.req.header('Authorization'), tenantId, projectId);

    const executionContext = await buildAnonymousExecutionContext({
      tenantId,
      projectId,
      agentId,
    });

    const body = await c.req.json();
    const conversationId = body.conversationId || getConversationId();

    const fullAgent = executionContext.project.agents[agentId];
    if (!fullAgent) {
      throw createApiError({ code: 'not_found', message: 'Agent not found' });
    }

    const agentKeys = Object.keys((fullAgent.subAgents as Record<string, any>) || {});
    const firstAgentId = agentKeys.length > 0 ? agentKeys[0] : '';
    const defaultSubAgentId = (fullAgent.defaultSubAgentId as string) || firstAgentId;

    if (!defaultSubAgentId) {
      throw createApiError({ code: 'not_found', message: 'No default agent found' });
    }

    await createOrGetConversation(runDbClient)({
      tenantId,
      projectId,
      id: conversationId,
      agentId,
      activeSubAgentId: defaultSubAgentId,
      anonymousUserId: anonUser.anonymousUserId,
      ref: executionContext.resolvedRef,
    });

    try {
      await writeRelationship({
        resourceType: SpiceDbResourceTypes.CONVERSATION,
        resourceId: conversationId,
        relation: 'participant',
        subjectType: SpiceDbResourceTypes.ANONYMOUS_USER,
        subjectId: anonUser.anonymousUserId,
      });
    } catch (err) {
      logger.warn(
        { err, conversationId, anonymousUserId: anonUser.anonymousUserId },
        'Failed to write SpiceDB relationship (non-fatal for PoC)'
      );
    }

    try {
      await writeRelationship({
        resourceType: SpiceDbResourceTypes.CONVERSATION,
        resourceId: conversationId,
        relation: 'project',
        subjectType: SpiceDbResourceTypes.PROJECT,
        subjectId: projectId,
      });
    } catch (err) {
      logger.warn(
        { err, conversationId, projectId },
        'Failed to write SpiceDB project relationship (non-fatal for PoC)'
      );
    }

    const activeAgent = await getActiveAgentForConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });
    if (!activeAgent) {
      await setActiveAgentForConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
        agentId,
        subAgentId: defaultSubAgentId,
        ref: executionContext.resolvedRef,
      });
    }
    const subAgentId = activeAgent?.activeSubAgentId || defaultSubAgentId;

    const agentInfo = executionContext.project.agents[agentId]?.subAgents[subAgentId];
    if (!agentInfo) {
      throw createApiError({ code: 'not_found', message: 'Agent not found' });
    }

    const lastUserMessage = body.messages
      .filter((msg: Message) => msg.role === 'user')
      .slice(-1)[0];
    const userMessage = lastUserMessage ? getMessageText(lastUserMessage.content) : '';

    await createMessage(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      conversationId,
      role: 'user',
      content: { text: userMessage },
      visibility: 'user-facing',
      messageType: 'chat',
    });

    if (isNew) {
      c.header('x-anonymous-token', anonToken);
    }

    const requestId = `chatcmpl-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);

    return streamSSE(c, async (stream) => {
      try {
        const sseHelper = createSSEStreamHelper(stream, requestId, timestamp);
        await sseHelper.writeRole();

        const executionHandler = new ExecutionHandler();
        const result = await executionHandler.execute({
          executionContext,
          conversationId,
          userMessage,
          initialAgentId: subAgentId,
          requestId,
          sseHelper,
          emitOperations: false,
          forwardedHeaders: {},
        });

        logger.info(
          { result },
          `Anonymous execution completed: ${result.success ? 'success' : 'failed'} after ${result.iterations} iterations`
        );

        if (!result.success) {
          await sseHelper.writeOperation(
            errorOp(
              'Sorry, I was unable to process your request at this time. Please try again.',
              'system'
            )
          );
        }

        await sseHelper.complete();
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : error },
          'Error during anonymous streaming execution'
        );
        try {
          const sseHelper = createSSEStreamHelper(stream, requestId, timestamp);
          await sseHelper.writeOperation(
            errorOp(
              'Sorry, I was unable to process your request at this time. Please try again.',
              'system'
            )
          );
          await sseHelper.complete();
        } catch (streamError) {
          logger.error({ streamError }, 'Failed to write error to stream');
        }
      }
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      'Error in anonymous chat endpoint'
    );

    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }

    throw createApiError({
      code: 'internal_server_error',
      message: error instanceof Error ? error.message : 'Failed to process anonymous chat',
    });
  }
});

const getMessageText = (content: string | ContentItem[]): string => {
  if (typeof content === 'string') return content;
  return content
    .filter((item) => item.type === 'text' && item.text)
    .map((item) => item.text)
    .join(' ');
};

export default app;
