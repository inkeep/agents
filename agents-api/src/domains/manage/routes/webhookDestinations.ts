import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createWebhookDestination,
  deleteWebhookDestination,
  generateId,
  getWebhookDestinationAgentIds,
  getWebhookDestinationById,
  getWebhookDestinationEvaluatorIds,
  listWebhookDestinationsPaginated,
  PaginationQueryParamsSchema,
  setWebhookDestinationAgentIds,
  setWebhookDestinationEvaluatorIds,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateWebhookDestination,
  WebhookDestinationApiInsertSchema,
  type WebhookDestinationApiSelect,
  WebhookDestinationApiUpdateSchema,
  WebhookDestinationListResponse,
  WebhookDestinationResponse,
} from '@inkeep/agents-core';
import { FileSecurityError } from '@inkeep/agents-core/external-fetch';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { getSlackClient, resolveWorkspaceToken } from '@inkeep/agents-work-apps/slack';
import { HTTPException } from 'hono/http-exception';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';
import {
  fetchWithSsrfProtection,
  validateWebhookUrl,
  WebhookUrlSecurityError,
} from '../../../utils/webhook-url-security';
import {
  buildTestSlackPayload,
  isSlackIncomingWebhookUrl,
  type SlackContext,
} from '../../run/services/slackBlockKit';

const logger = getLogger('webhookDestinations');

async function validateSlackChannelId(tenantId: string, slackChannelId: string): Promise<void> {
  let botToken: string;
  try {
    botToken = await resolveWorkspaceToken(tenantId);
  } catch {
    throw createApiError({
      code: 'bad_request',
      message: 'No Slack workspace connected. Install the Slack app first.',
    });
  }

  const client = getSlackClient(botToken);
  try {
    const result = await client.conversations.info({ channel: slackChannelId });
    if (!result.ok) {
      throw createApiError({
        code: 'bad_request',
        message: `Channel ${slackChannelId} not found in your Slack workspace`,
      });
    }
    if (!result.channel?.is_member) {
      throw createApiError({
        code: 'bad_request',
        message: `The Inkeep bot is not a member of this channel. Add the bot to the channel first.`,
      });
    }
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    throw createApiError({
      code: 'bad_request',
      message: `Unable to verify channel ${slackChannelId}. Ensure it exists and the bot has access.`,
    });
  }
}

function toApiShape(
  dest: {
    tenantId: string;
    projectId: string;
    [key: string]: unknown;
  },
  agentIds?: string[],
  evaluatorIds?: string[]
): WebhookDestinationApiSelect {
  const { tenantId: _tid, projectId: _pid, ...rest } = dest;
  return {
    ...rest,
    ...(agentIds && { agentIds }),
    ...(evaluatorIds && { evaluatorIds }),
  } as unknown as WebhookDestinationApiSelect;
}

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Webhook Destinations',
    operationId: 'list-webhook-destinations',
    tags: ['Webhooks'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        agentId: z.string().optional().openapi({ description: 'Filter by agent ID' }),
      }),
    },
    responses: {
      200: {
        description: 'List of webhook destinations retrieved successfully',
        content: {
          'application/json': {
            schema: WebhookDestinationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const { page, limit, agentId } = c.req.valid('query');

    const result = await listWebhookDestinationsPaginated(db)({
      scopes: { tenantId, projectId },
      pagination: { page, limit },
      agentId,
    });

    return c.json({
      data: result.data.map((dest) => toApiShape(dest)),
      pagination: result.pagination,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Webhook Destination',
    operationId: 'get-webhook-destination',
    tags: ['Webhooks'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Webhook destination found',
        content: {
          'application/json': {
            schema: WebhookDestinationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    const dest = await getWebhookDestinationById(db)({
      scopes: { tenantId, projectId },
      webhookDestinationId: id,
    });

    if (!dest) {
      throw createApiError({
        code: 'not_found',
        message: 'Webhook destination not found',
      });
    }

    const agentIds = await getWebhookDestinationAgentIds(db)({
      scopes: { tenantId, projectId },
      webhookDestinationId: id,
    });

    const evaluatorIds = await getWebhookDestinationEvaluatorIds(db)({
      scopes: { tenantId, projectId },
      webhookDestinationId: id,
    });

    return c.json({ data: toApiShape(dest, agentIds, evaluatorIds) });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Webhook Destination',
    operationId: 'create-webhook-destination',
    tags: ['Webhooks'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: WebhookDestinationApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Webhook destination created successfully',
        content: {
          'application/json': {
            schema: WebhookDestinationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const id = body.id || generateId();

    if (!body.url && !body.slackChannelId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Either url or slackChannelId must be provided',
      });
    }
    if (body.url && body.slackChannelId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Provide either url or slackChannelId, not both',
      });
    }

    if (body.url) {
      try {
        validateWebhookUrl(body.url);
      } catch (err) {
        throw createApiError({
          code: 'bad_request',
          message: err instanceof WebhookUrlSecurityError ? err.message : 'Invalid webhook URL',
        });
      }
    }

    if (body.slackChannelId) {
      await validateSlackChannelId(tenantId, body.slackChannelId);
    }

    logger.debug({ webhookDestinationId: id }, 'Creating webhook destination');

    const { agentIds: bodyAgentIds, evaluatorIds: bodyEvaluatorIds, ...insertBody } = body;
    const agentIds = bodyAgentIds ?? [];
    const evaluatorIds = bodyEvaluatorIds ?? [];

    const dest = await db.transaction(async (tx) => {
      const created = await createWebhookDestination(tx)({
        ...insertBody,
        id,
        tenantId,
        projectId,
        enabled: body.enabled !== undefined ? body.enabled : true,
      });

      if (agentIds.length > 0) {
        await setWebhookDestinationAgentIds(tx)({
          scopes: { tenantId, projectId },
          webhookDestinationId: id,
          agentIds,
        });
      }

      if (evaluatorIds.length > 0) {
        await setWebhookDestinationEvaluatorIds(tx)({
          scopes: { tenantId, projectId },
          webhookDestinationId: id,
          evaluatorIds,
        });
      }

      return created;
    });

    return c.json({ data: toApiShape(dest, agentIds, evaluatorIds) }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Webhook Destination',
    operationId: 'update-webhook-destination',
    tags: ['Webhooks'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: WebhookDestinationApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Webhook destination updated successfully',
        content: {
          'application/json': {
            schema: WebhookDestinationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    const existing = await getWebhookDestinationById(db)({
      scopes: { tenantId, projectId },
      webhookDestinationId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Webhook destination not found',
      });
    }

    const resultingUrl = body.url !== undefined ? body.url : existing.url;
    const resultingChannel =
      body.slackChannelId !== undefined ? body.slackChannelId : existing.slackChannelId;

    if (resultingUrl && resultingChannel) {
      throw createApiError({
        code: 'bad_request',
        message:
          'A destination cannot have both url and slackChannelId. Clear one before setting the other.',
      });
    }
    if (!resultingUrl && !resultingChannel) {
      throw createApiError({
        code: 'bad_request',
        message: 'A destination must have either url or slackChannelId',
      });
    }

    if (body.url) {
      try {
        validateWebhookUrl(body.url);
      } catch (err) {
        throw createApiError({
          code: 'bad_request',
          message: err instanceof WebhookUrlSecurityError ? err.message : 'Invalid webhook URL',
        });
      }
    }

    if (body.slackChannelId) {
      await validateSlackChannelId(tenantId, body.slackChannelId);
    }

    logger.debug({ webhookDestinationId: id }, 'Updating webhook destination');

    const { agentIds: bodyAgentIds, evaluatorIds: bodyEvaluatorIds, ...updateBody } = body;

    const { updated, agentIds, evaluatorIds } = await db.transaction(async (tx) => {
      const result = await updateWebhookDestination(tx)({
        scopes: { tenantId, projectId },
        webhookDestinationId: id,
        data: updateBody,
      });

      if (!result) {
        throw createApiError({
          code: 'not_found',
          message: 'Webhook destination not found',
        });
      }

      if (bodyAgentIds !== undefined) {
        await setWebhookDestinationAgentIds(tx)({
          scopes: { tenantId, projectId },
          webhookDestinationId: id,
          agentIds: bodyAgentIds,
        });
      }

      if (bodyEvaluatorIds !== undefined) {
        await setWebhookDestinationEvaluatorIds(tx)({
          scopes: { tenantId, projectId },
          webhookDestinationId: id,
          evaluatorIds: bodyEvaluatorIds,
        });
      }

      const ids =
        bodyAgentIds ??
        (await getWebhookDestinationAgentIds(tx)({
          scopes: { tenantId, projectId },
          webhookDestinationId: id,
        }));

      const evalIds =
        bodyEvaluatorIds ??
        (await getWebhookDestinationEvaluatorIds(tx)({
          scopes: { tenantId, projectId },
          webhookDestinationId: id,
        }));

      return { updated: result, agentIds: ids, evaluatorIds: evalIds };
    });

    return c.json({ data: toApiShape(updated, agentIds, evaluatorIds) });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Webhook Destination',
    operationId: 'delete-webhook-destination',
    tags: ['Webhooks'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Webhook destination deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    logger.debug({ webhookDestinationId: id }, 'Deleting webhook destination');

    const deleted = await deleteWebhookDestination(db)({
      scopes: { tenantId, projectId },
      webhookDestinationId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Webhook destination not found',
      });
    }

    return c.body(null, 204);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{id}/test',
    summary: 'Test Webhook Destination',
    operationId: 'test-webhook-destination',
    tags: ['Webhooks'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Test event sent successfully',
        content: {
          'application/json': {
            schema: z
              .object({
                success: z.boolean(),
                statusCode: z.number().int().optional(),
                error: z.string().optional(),
              })
              .openapi('WebhookDestinationTestResult'),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, id } = c.req.valid('param');

    const dest = await getWebhookDestinationById(db)({
      scopes: { tenantId, projectId },
      webhookDestinationId: id,
    });

    if (!dest) {
      throw createApiError({
        code: 'not_found',
        message: 'Webhook destination not found',
      });
    }

    const now = new Date().toISOString();
    const testEnvelope = {
      type: 'test',
      timestamp: now,
      tenantId,
      projectId,
      agentId: 'test-agent-id',
      data: {
        conversation: {
          id: 'test-conversation-id',
          agentId: 'test-agent-id',
          title: 'Test webhook delivery',
          userProperties: { email: 'test@example.com', plan: 'pro' },
          properties: null,
          createdAt: now,
          updatedAt: now,
          messages: [
            {
              id: 'test-message-id',
              role: 'user',
              content: 'This is a test webhook delivery',
              createdAt: now,
            },
          ],
        },
      },
    };

    const slackCtx: SlackContext = {
      tenantId,
      projectId,
      agentId: 'test-agent-id',
      manageUiBaseUrl: env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000',
    };

    if (dest.slackChannelId) {
      try {
        const botToken = await resolveWorkspaceToken(tenantId);
        const slackClient = getSlackClient(botToken);
        const payload = buildTestSlackPayload(testEnvelope, slackCtx);
        const args = {
          channel: dest.slackChannelId,
          text: payload.text as string,
          blocks: payload.blocks as unknown[],
        };
        await slackClient.chat.postMessage(
          args as Parameters<typeof slackClient.chat.postMessage>[0]
        );
        return c.json({ success: true });
      } catch (err) {
        logger.warn(
          { webhookDestinationId: id, error: err instanceof Error ? err.message : String(err) },
          'Test Slack bot delivery failed'
        );
        return c.json({
          success: false,
          error: 'Slack delivery failed',
        });
      }
    }

    if (!dest.url) {
      return c.json({
        success: false,
        error: 'Destination has no URL or Slack channel configured',
      });
    }

    const requestBody = isSlackIncomingWebhookUrl(dest.url)
      ? buildTestSlackPayload(testEnvelope, slackCtx)
      : testEnvelope;

    try {
      const response = await fetchWithSsrfProtection(dest.url, {
        method: 'POST',
        headers: {
          ...dest.headers,
          'Content-Type': 'application/json',
          'User-Agent': 'Inkeep-Webhooks/1.0',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10_000),
      });

      let deliveryError: string | undefined;
      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        if (responseText) {
          const truncated =
            responseText.length > 500 ? `${responseText.slice(0, 497)}...` : responseText;
          deliveryError = truncated;
        }
      }

      return c.json({
        success: response.ok,
        statusCode: response.status,
        ...(deliveryError !== undefined ? { error: deliveryError } : {}),
      });
    } catch (err) {
      if (err instanceof WebhookUrlSecurityError || err instanceof FileSecurityError) {
        throw createApiError({
          code: 'bad_request',
          message: 'Destination URL blocked by security policy',
        });
      }
      logger.warn(
        { webhookDestinationId: id, error: err instanceof Error ? err.message : String(err) },
        'Test webhook delivery failed'
      );
      return c.json({
        success: false,
        error: 'Webhook delivery failed',
      });
    }
  }
);

export default app;
