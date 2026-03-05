import { OpenAPIHono } from '@hono/zod-openapi';
import {
  type AgentsManageDatabaseClient,
  commonGetErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  getSlackMcpToolAccessConfig,
  getToolById,
  setSlackMcpToolAccessConfig,
  TenantProjectToolParamsSchema,
  WorkAppSlackMcpToolAccessConfigApiInsertSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const logger = getLogger('mcp-tool-slack-access');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();


async function validateSlackWorkappTool(
  db: AgentsManageDatabaseClient,
  tenantId: string,
  projectId: string,
  toolId: string
): Promise<void> {
  const tool = await getToolById(db)({
    scopes: { tenantId, projectId },
    toolId,
  });

  if (!tool) {
    throw createApiError({
      code: 'not_found',
      message: `Tool not found: ${toolId}`,
    });
  }

  if (!tool.isWorkApp) {
    throw createApiError({
      code: 'bad_request',
      message: 'Slack access can only be configured for workapp MCP tools',
    });
  }

  const toolUrl = tool.config.mcp.server.url;
  if (!toolUrl?.includes('/slack/mcp')) {
    throw createApiError({
      code: 'bad_request',
      message: 'Slack access can only be configured for Slack MCP tools',
    });
  }
}

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'Get MCP tool Slack channel access',
    operationId: 'get-mcp-tool-slack-access',
    tags: ['Tools'],
    description:
      'Returns the current Slack channel access configuration for an MCP tool. ' +
      'If channelAccessMode is "all", the tool can post to any channel. ' +
      'If channelAccessMode is "selected", the tool is scoped to specific channels.',
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectToolParamsSchema,
    },
    responses: {
      200: {
        description: 'Slack access configuration retrieved successfully',
        content: {
          'application/json': {
            schema: WorkAppSlackMcpToolAccessConfigApiInsertSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, toolId } = c.req.valid('param');
    const db = c.get('db');

    logger.info({ tenantId, projectId, toolId }, 'Getting MCP tool Slack access configuration');

    await validateSlackWorkappTool(db, tenantId, projectId, toolId);

    const config = await getSlackMcpToolAccessConfig(runDbClient)(toolId);

    return c.json(
      {
        channelAccessMode: config.channelAccessMode,
        dmEnabled: config.dmEnabled,
        channelIds: config.channelIds,
      },
      200
    );
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/',
    summary: 'Set MCP tool Slack channel access',
    operationId: 'set-mcp-tool-slack-access',
    tags: ['Tools'],
    description:
      'Configures which Slack channels an MCP tool can post to. ' +
      'When channelAccessMode is "all", the tool can post to any channel. ' +
      'When channelAccessMode is "selected", the tool is scoped to specific channels (channelIds required).',
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectToolParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: WorkAppSlackMcpToolAccessConfigApiInsertSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Slack access configuration updated successfully',
        content: {
          'application/json': {
            schema: WorkAppSlackMcpToolAccessConfigApiInsertSchema,
          },
        },
      },
      ...commonUpdateErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, toolId } = c.req.valid('param');
    const { channelAccessMode, dmEnabled, channelIds } = c.req.valid('json');
    const db = c.get('db');

    logger.info(
      { tenantId, projectId, toolId, channelAccessMode },
      'Setting MCP tool Slack access configuration'
    );

    await validateSlackWorkappTool(db, tenantId, projectId, toolId);

    if (channelAccessMode === 'selected') {
      if (!channelIds || channelIds.length === 0) {
        throw createApiError({
          code: 'bad_request',
          message: 'channelIds is required when channelAccessMode is "selected"',
        });
      }

      await setSlackMcpToolAccessConfig(runDbClient)({
        toolId,
        tenantId,
        projectId,
        channelAccessMode: 'selected',
        dmEnabled,
        channelIds,
      });

      logger.info(
        { tenantId, projectId, toolId, channelCount: channelIds.length },
        'MCP tool Slack access set to selected channels'
      );

      return c.json(
        {
          channelAccessMode: 'selected' as const,
          dmEnabled,
          channelIds,
        },
        200
      );
    }

    await setSlackMcpToolAccessConfig(runDbClient)({
      toolId,
      tenantId,
      projectId,
      channelAccessMode: 'all',
      dmEnabled,
      channelIds: [],
    });

    logger.info({ tenantId, projectId, toolId }, 'MCP tool Slack access set to all channels');

    return c.json(
      {
        channelAccessMode: 'all' as const,
        dmEnabled,
        channelIds: [],
      },
      200
    );
  }
);

export default app;
