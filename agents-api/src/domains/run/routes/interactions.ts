import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  createMessage,
  type FullExecutionContext,
  generateId,
  getPendingInteraction,
  respondToInteraction,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('InteractionsRoute');

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: FullExecutionContext;
  requestBody?: any;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

const respondToInteractionRoute = createProtectedRoute({
  method: 'post',
  path: '/{interactionId}/respond',
  tags: ['Interactions'],
  summary: 'Respond to a pending interaction',
  description:
    'Responds to a pending tool approval or elicitation request. For approved tool calls, the tool will be executed and the result stored.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    params: z.object({
      interactionId: z.string().describe('The ID of the pending interaction'),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            approved: z.boolean().describe('Whether the interaction is approved'),
            reason: z.string().optional().describe('Optional reason for approval/denial'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Interaction response processed',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            interactionId: z.string().optional(),
            status: z.string().optional(),
            toolResult: z.any().optional(),
            message: z.string().optional(),
            error: z.string().optional(),
            alreadyProcessed: z.boolean().optional(),
          }),
        },
      },
    },
    404: {
      description: 'Interaction not found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
});

app.openapi(respondToInteractionRoute, async (c: any) => {
  const { interactionId } = c.req.valid('param');
  const { approved, reason } = c.req.valid('json');

  const executionContext = c.get('executionContext');
  const { tenantId, projectId } = executionContext;

  logger.info(
    { interactionId, approved, reason, tenantId, projectId },
    'Processing interaction response'
  );

  const interaction = await getPendingInteraction(runDbClient)({
    tenantId,
    projectId,
    interactionId,
  });

  if (!interaction) {
    logger.warn({ interactionId }, 'Interaction not found');
    return c.json({ success: false, error: 'Interaction not found' }, 404);
  }

  if (interaction.status !== 'pending') {
    logger.warn({ interactionId, status: interaction.status }, 'Interaction already processed');
    return c.json({
      success: true,
      interactionId,
      status: interaction.status,
      message: 'Interaction was already processed',
      alreadyProcessed: true,
    });
  }

  const status = approved ? 'accepted' : 'declined';

  const responseData =
    interaction.type === 'tool-approval'
      ? {
          type: 'tool-approval' as const,
          approved,
          reason,
        }
      : {
          type: 'elicitation-form' as const,
          action: approved ? ('accept' as const) : ('decline' as const),
        };

  const updated = await respondToInteraction(runDbClient)({
    tenantId,
    projectId,
    interactionId,
    response: responseData,
    status,
  });

  if (!updated) {
    logger.error({ interactionId }, 'Failed to update interaction');
    return c.json({ success: false, error: 'Failed to update interaction' }, 500);
  }

  if (interaction.type === 'tool-approval') {
    const interactionData = interaction.interactionData as {
      type: 'tool-approval';
      toolCallId: string;
      toolName: string;
      toolArgs: Record<string, unknown>;
      toolType: 'mcp' | 'function';
    };

    const messageContent = approved
      ? `Tool "${interactionData.toolName}" was approved. Please re-send your message to continue execution.`
      : `Tool "${interactionData.toolName}" was denied${reason ? `: ${reason}` : ''}. The agent will continue without executing this tool.`;

    await createMessage(runDbClient)({
      id: generateId(),
      tenantId,
      projectId,
      conversationId: interaction.conversationId,
      role: 'system',
      content: {
        text: messageContent,
        parts: [{ kind: 'text', text: messageContent }],
      },
      visibility: 'user-facing',
      messageType: 'system',
      fromSubAgentId: interaction.subAgentId,
      taskId: interaction.taskId || undefined,
    });

    logger.info(
      {
        interactionId,
        toolName: interactionData.toolName,
        toolCallId: interactionData.toolCallId,
        status,
      },
      'Tool approval processed'
    );

    return c.json({
      success: true,
      interactionId,
      status,
      message: messageContent,
    });
  }

  logger.info({ interactionId, status }, 'Interaction response recorded');

  return c.json({
    success: true,
    interactionId,
    status,
    message: approved
      ? 'Interaction approved'
      : `Interaction declined${reason ? `: ${reason}` : ''}`,
  });
});

const getInteractionRoute = createProtectedRoute({
  method: 'get',
  path: '/{interactionId}',
  tags: ['Interactions'],
  summary: 'Get a pending interaction',
  description:
    'Retrieves details about a pending interaction including its status and checkpoint data.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    params: z.object({
      interactionId: z.string().describe('The ID of the pending interaction'),
    }),
  },
  responses: {
    200: {
      description: 'Interaction details',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            type: z.string(),
            status: z.string(),
            conversationId: z.string(),
            interactionData: z.any(),
            createdAt: z.string(),
            expiresAt: z.string().optional().nullable(),
            success: z.boolean().optional(),
            error: z.string().optional(),
          }),
        },
      },
    },
    404: {
      description: 'Interaction not found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
});

app.openapi(getInteractionRoute, async (c: any) => {
  const { interactionId } = c.req.valid('param');

  const executionContext = c.get('executionContext');
  const { tenantId, projectId } = executionContext;

  const interaction = await getPendingInteraction(runDbClient)({
    tenantId,
    projectId,
    interactionId,
  });

  if (!interaction) {
    return c.json({ success: false, error: 'Interaction not found' }, 404);
  }

  return c.json({
    id: interaction.id,
    type: interaction.type,
    status: interaction.status,
    conversationId: interaction.conversationId,
    interactionData: interaction.interactionData,
    createdAt: interaction.createdAt,
    expiresAt: interaction.expiresAt || null,
  });
});

export default app;
