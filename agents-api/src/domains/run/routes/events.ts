import { OpenAPIHono } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  type ConversationSelect,
  type CredentialStoreRegistry,
  commonCreateErrorResponses,
  createApiError,
  createEvent,
  EventApiInsertSchema,
  EventResponse,
  generateId,
  getConversation,
  getConversationUserProperties,
  getMessageById,
  getMessageUserProperties,
  isForeignKeyViolation,
  type MessageSelect,
  type ProjectScopeConfig,
  type ResolvedRef,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { formatEvent } from '../../../utils/conversationFormatter';
import { emitEventWebhook } from '../services/WebhookDeliveryService';
import { isAutoMintIdentity, stripIdentificationType } from '../utils/user-properties';

const logger = getLogger('run-events');

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: BaseExecutionContext;
  resolvedRef?: ResolvedRef;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

type EventBodyAnchors = {
  userProperties?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  // Anchors are nullable on the underlying schema (column-level); the route
  // treats null and undefined identically as "not supplied" via truthy checks.
  messageId?: string | null;
  conversationId?: string | null;
};

async function resolveAutoFillChain(params: {
  body: EventBodyAnchors;
  scopes: ProjectScopeConfig;
}): Promise<{
  userProperties: Record<string, unknown> | null;
  properties: Record<string, unknown> | null;
  conversationId: string | null;
}> {
  const { body, scopes } = params;

  // Filter widget-synthesized auto-mint identities from caller-supplied
  // userProperties — same defense the chat handlers apply on their write
  // path. Without this, a caller could POST `{ identificationType: 'ANONYMOUS', ... }`
  // and the placeholder identity would persist to the events table and ride
  // along on every event.created webhook.
  const callerUserProperties = isAutoMintIdentity(body.userProperties)
    ? undefined
    : stripIdentificationType(body.userProperties);
  const callerProperties = body.properties;

  let messageRow: MessageSelect | undefined;
  let conversationRow: ConversationSelect | undefined;
  try {
    // Always resolve the message row when messageId is supplied so the resolved
    // conversationId can be backfilled onto the event row, even when both
    // userProperties and properties were caller-supplied.
    if (body.messageId) {
      messageRow = await getMessageById(runDbClient)({
        scopes,
        messageId: body.messageId,
      });
    }

    const conversationId = body.conversationId ?? messageRow?.conversationId;
    const needsConversationEnrichment =
      callerUserProperties === undefined || callerProperties === undefined;
    if (conversationId && needsConversationEnrichment) {
      conversationRow = await getConversation(runDbClient)({ scopes, conversationId });
    }
  } catch (err) {
    logger.warn(
      {
        messageId: body.messageId,
        conversationId: body.conversationId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Auto-fill enrichment failed; proceeding with caller-supplied values'
    );
    return {
      userProperties: callerUserProperties ?? null,
      properties: callerProperties ?? null,
      conversationId: body.conversationId ?? null,
    };
  }

  const resolvedConversationId = body.conversationId ?? messageRow?.conversationId ?? null;

  let resolvedUserProperties: Record<string, unknown> | null;
  if (callerUserProperties !== undefined) {
    resolvedUserProperties = callerUserProperties;
  } else {
    resolvedUserProperties = messageRow
      ? getMessageUserProperties(messageRow, conversationRow)
      : conversationRow
        ? getConversationUserProperties(conversationRow)
        : null;
  }

  let resolvedProperties: Record<string, unknown> | null;
  if (callerProperties !== undefined) {
    resolvedProperties = callerProperties;
  } else {
    resolvedProperties = messageRow?.properties ?? conversationRow?.properties ?? null;
  }

  return {
    userProperties: resolvedUserProperties,
    properties: resolvedProperties,
    conversationId: resolvedConversationId,
  };
}

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Log Event',
    description: 'Log an application-level event for the authenticated project.',
    operationId: 'log-event',
    tags: ['Events'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: EventApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Event logged successfully (new row inserted)',
        content: {
          'application/json': {
            schema: EventResponse,
          },
        },
      },
      200: {
        description: 'Event already exists (idempotent conflict on client-supplied id)',
        content: {
          'application/json': {
            schema: EventResponse,
          },
        },
      },
      ...commonCreateErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const body = c.req.valid('json');

    const {
      userProperties: resolvedUserProperties,
      properties: resolvedProperties,
      conversationId: resolvedConversationId,
    } = await resolveAutoFillChain({
      body,
      scopes: { tenantId, projectId },
    });

    let result: Awaited<ReturnType<ReturnType<typeof createEvent>>>;
    try {
      result = await createEvent(runDbClient)({
        ...body,
        id: body.id || generateId(),
        tenantId,
        projectId,
        conversationId: resolvedConversationId,
        agentId: body.agentId ?? executionContext.agentId ?? null,
        userProperties: resolvedUserProperties,
        properties: resolvedProperties,
        metadata: body.metadata ?? null,
        serverMetadata: {
          authMethod: executionContext.metadata?.authMethod,
        },
      });
    } catch (err) {
      // An invalid `conversationId` or `messageId` (nonexistent or cross-tenant)
      // produces an FK constraint violation here. Translate to 422 instead of
      // letting the global handler return a generic 500.
      if (isForeignKeyViolation(err)) {
        logger.warn(
          {
            tenantId,
            projectId,
            conversationId: resolvedConversationId,
            messageId: body.messageId,
            error: err instanceof Error ? err.message : String(err),
          },
          'Event references nonexistent conversationId or messageId'
        );
        throw createApiError({
          code: 'bad_request',
          message:
            'The referenced conversationId or messageId does not exist or is not accessible.',
        });
      }
      throw err;
    }

    logger.debug(
      {
        tenantId,
        projectId,
        eventId: result.row.id,
        type: result.row.type,
        conflict: result.conflict,
      },
      'Logged event'
    );

    const formatted = formatEvent(result.row);

    const resolvedRef = c.get('resolvedRef');
    const dispatchAgentId = result.row.agentId ?? executionContext.agentId;
    if (!resolvedRef || !dispatchAgentId) {
      // Free-form events (no agentId, or no resolved ref on the request)
      // are persisted but cannot be routed to webhook destinations, since
      // destinations are scoped per agent ref. Trace it so operators can
      // diagnose missing webhook deliveries.
      logger.debug(
        {
          tenantId,
          projectId,
          eventId: result.row.id,
          type: result.row.type,
          hasResolvedRef: !!resolvedRef,
          hasAgentId: !!dispatchAgentId,
        },
        'Skipping event.created webhook dispatch (event persisted; no resolvedRef or agentId)'
      );
    } else {
      await emitEventWebhook({
        tenantId,
        projectId,
        agentId: dispatchAgentId,
        resolvedRef,
        event: result.row,
      });
    }

    return c.json({ data: formatted }, result.conflict ? 200 : 201);
  }
);

export default app;
