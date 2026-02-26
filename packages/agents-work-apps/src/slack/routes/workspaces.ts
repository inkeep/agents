/**
 * Slack Workspace Routes
 *
 * RESTful endpoints for managing Slack workspaces and their configurations:
 * - GET /workspaces - List all installed workspaces
 * - GET /workspaces/:teamId - Get workspace details
 * - PUT /workspaces/:teamId/settings - Update workspace settings (default agent) [ADMIN ONLY]
 * - DELETE /workspaces/:teamId - Uninstall workspace [ADMIN ONLY]
 * - GET /workspaces/:teamId/channels - List channels
 * - GET /workspaces/:teamId/channels/:channelId/settings - Get channel config
 * - PUT /workspaces/:teamId/channels/:channelId/settings - Set channel default agent [ADMIN or CHANNEL MEMBER]
 * - DELETE /workspaces/:teamId/channels/:channelId/settings - Remove channel config [ADMIN or CHANNEL MEMBER]
 * - GET /workspaces/:teamId/users - List linked users
 *
 * Permission Model:
 * - Read operations (GET): Authenticated users only (tenant isolation via verifyTenantOwnership in handler)
 * - Workspace settings (PUT): Inkeep org admin/owner only (requireWorkspaceAdmin middleware)
 * - Channel settings (PUT/DELETE): Inkeep org admin/owner OR channel member (requireChannelMemberOrAdmin middleware)
 * - Workspace uninstall (DELETE): Inkeep org admin/owner only (requireWorkspaceAdmin middleware)
 */

import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  deleteAllWorkAppSlackChannelAgentConfigsByTeam,
  deleteAllWorkAppSlackUserMappingsByTeam,
  deleteWorkAppSlackChannelAgentConfig,
  deleteWorkAppSlackWorkspaceByNangoConnectionId,
  findWorkAppSlackChannelAgentConfig,
  findWorkAppSlackWorkspaceByTeamId,
  listWorkAppSlackChannelAgentConfigsByTeam,
  listWorkAppSlackUserMappingsByTeam,
  updateWorkAppSlackWorkspace,
  upsertWorkAppSlackChannelAgentConfig,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedWorkAppsAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { requireChannelMemberOrAdmin, requireWorkspaceAdmin } from '../middleware/permissions';
import {
  clearWorkspaceConnectionCache,
  computeWorkspaceConnectionId,
  deleteWorkspaceInstallation,
  findWorkspaceConnectionByTeamId,
  getBotMemberChannels,
  getSlackChannels,
  getSlackClient,
  getWorkspaceDefaultAgentFromNango,
  listWorkspaceInstallations,
  lookupAgentName,
  lookupProjectName,
  revokeSlackToken,
  setWorkspaceDefaultAgent as setWorkspaceDefaultAgentInNango,
} from '../services';
import type { ManageAppVariables } from '../types';

const logger = getLogger('slack-workspaces');

/**
 * Verify workspace belongs to the authenticated user's tenant.
 * Returns true if access is allowed, false if denied.
 */
function verifyTenantOwnership(
  c: { get: (key: string) => unknown },
  workspaceTenantId: string
): boolean {
  const sessionTenantId = c.get('tenantId') as string | undefined;
  if (!sessionTenantId) return false; // Require session context for tenant isolation
  return sessionTenantId === workspaceTenantId;
}

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const ChannelAgentConfigResponseSchema = z.object({
  projectId: z.string(),
  agentId: z.string(),
  agentName: z.string().optional(),
  projectName: z.string().optional(),
  grantAccessToMembers: z.boolean().optional(),
});

const ChannelAgentConfigRequestSchema = z.object({
  projectId: z.string(),
  agentId: z.string(),
  grantAccessToMembers: z.boolean().optional(),
});

const WorkspaceSettingsResponseSchema = z.object({
  defaultAgent: ChannelAgentConfigResponseSchema.optional(),
});

const WorkspaceSettingsRequestSchema = z.object({
  defaultAgent: ChannelAgentConfigRequestSchema.optional(),
});

const JoinFromWorkspaceSettingsSchema = z.object({
  shouldAllowJoinFromWorkspace: z.boolean(),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Workspaces',
    description: 'List all installed Slack workspaces for the tenant',
    operationId: 'slack-list-workspaces',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: inheritedWorkAppsAuth(),
    responses: {
      200: {
        description: 'List of workspaces',
        content: {
          'application/json': {
            schema: z.object({
              workspaces: z.array(
                z.object({
                  connectionId: z.string(),
                  teamId: z.string(),
                  teamName: z.string().optional(),
                  teamDomain: z.string().optional(),
                  tenantId: z.string(),
                  hasDefaultAgent: z.boolean(),
                  defaultAgentName: z.string().optional(),
                })
              ),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    try {
      const allWorkspaces = await listWorkspaceInstallations();

      // Filter by authenticated user's tenant to enforce tenant isolation
      const sessionTenantId = c.get('tenantId') as string | undefined;
      if (!sessionTenantId) {
        logger.warn({}, 'No tenantId in session context — cannot list workspaces');
        return c.json({ workspaces: [] });
      }

      const workspaces = allWorkspaces.filter((w) => w.tenantId === sessionTenantId);

      logger.info(
        { count: workspaces.length, totalCount: allWorkspaces.length, tenantId: sessionTenantId },
        'Listed workspace installations'
      );

      const workspacesWithNames = await Promise.all(
        workspaces.map(async (w) => {
          let defaultAgentName: string | undefined;
          if (w.defaultAgent?.agentId && w.defaultAgent.projectId) {
            try {
              defaultAgentName = await lookupAgentName(
                w.tenantId,
                w.defaultAgent.projectId,
                w.defaultAgent.agentId
              );
            } catch {
              logger.warn(
                { agentId: w.defaultAgent.agentId },
                'Failed to resolve default agent name for workspace listing'
              );
            }
          }
          return {
            connectionId: w.connectionId,
            teamId: w.teamId,
            teamName: w.teamName,
            tenantId: w.tenantId,
            hasDefaultAgent: !!w.defaultAgent,
            defaultAgentName: defaultAgentName || w.defaultAgent?.agentId,
          };
        })
      );

      return c.json({
        workspaces: workspacesWithNames,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list workspaces');
      return c.json({ workspaces: [] });
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{teamId}',
    summary: 'Get Workspace',
    description: 'Get details of a specific Slack workspace',
    operationId: 'slack-get-workspace',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: inheritedWorkAppsAuth(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Workspace details',
        content: {
          'application/json': {
            schema: z.object({
              teamId: z.string(),
              teamName: z.string().optional(),
              tenantId: z.string(),
              connectionId: z.string(),
              defaultAgent: ChannelAgentConfigResponseSchema.optional(),
            }),
          },
        },
      },
      404: {
        description: 'Workspace not found',
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);

    if (!workspace || !verifyTenantOwnership(c, workspace.tenantId)) {
      return c.json({ error: 'Workspace not found' }, 404);
    }

    let defaultAgent:
      | { projectId: string; agentId: string; agentName?: string; projectName?: string }
      | undefined;

    const nangoDefault = await getWorkspaceDefaultAgentFromNango(teamId);
    if (nangoDefault) {
      const [agentName, projectName] = await Promise.all([
        lookupAgentName(workspace.tenantId, nangoDefault.projectId, nangoDefault.agentId),
        lookupProjectName(workspace.tenantId, nangoDefault.projectId),
      ]);
      defaultAgent = {
        projectId: nangoDefault.projectId,
        agentId: nangoDefault.agentId,
        agentName: agentName || nangoDefault.agentId,
        projectName: projectName || nangoDefault.projectId,
      };
    }

    return c.json({
      teamId: workspace.teamId,
      teamName: workspace.teamName,
      tenantId: workspace.tenantId,
      connectionId: workspace.connectionId,
      defaultAgent,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{teamId}/settings',
    summary: 'Get Workspace Settings',
    description: 'Get settings for a Slack workspace including default agent',
    operationId: 'slack-get-workspace-settings',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: inheritedWorkAppsAuth(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Workspace settings',
        content: {
          'application/json': {
            schema: WorkspaceSettingsResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace || !verifyTenantOwnership(c, workspace.tenantId)) {
      logger.warn({ teamId }, 'Workspace not found or tenant mismatch');
      return c.json({ defaultAgent: undefined });
    }

    let defaultAgent:
      | { projectId: string; agentId: string; agentName?: string; projectName?: string }
      | undefined;

    const nangoDefault = await getWorkspaceDefaultAgentFromNango(teamId);
    if (nangoDefault) {
      const [agentName, projectName] = await Promise.all([
        lookupAgentName(workspace.tenantId, nangoDefault.projectId, nangoDefault.agentId),
        lookupProjectName(workspace.tenantId, nangoDefault.projectId),
      ]);
      defaultAgent = {
        projectId: nangoDefault.projectId,
        agentId: nangoDefault.agentId,
        agentName: agentName || nangoDefault.agentId,
        projectName: projectName || nangoDefault.projectId,
      };
    }

    return c.json({
      defaultAgent,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{teamId}/settings',
    summary: 'Update Workspace Settings',
    description: 'Update workspace settings including default agent',
    operationId: 'slack-update-workspace-settings',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: requireWorkspaceAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: WorkspaceSettingsRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Settings updated',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
      500: {
        description: 'Failed to update settings',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');
    const body = c.req.valid('json');

    if (body.defaultAgent) {
      const nangoSuccess = await setWorkspaceDefaultAgentInNango(teamId, body.defaultAgent);
      if (!nangoSuccess) {
        logger.warn({ teamId }, 'Failed to persist workspace settings to Nango');
        return c.json({ success: false }, 500);
      }

      logger.info(
        {
          teamId,
          agentId: body.defaultAgent.agentId,
        },
        'Saved workspace default agent to Nango'
      );
    } else {
      await setWorkspaceDefaultAgentInNango(teamId, null);
      logger.info({ teamId }, 'Cleared workspace default agent');
    }

    return c.json({ success: true });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{teamId}/join-from-workspace',
    summary: 'Get Join From Workspace Setting',
    description: 'Get the join from workspace setting for the workspace',
    operationId: 'slack-get-join-from-workspace',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: inheritedWorkAppsAuth(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Join from workspace setting',
        content: {
          'application/json': {
            schema: JoinFromWorkspaceSettingsSchema,
          },
        },
      },
      404: {
        description: 'Workspace not found',
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');

    const sessionTenantId = c.get('tenantId') as string | undefined;
    if (!sessionTenantId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const workspace = await findWorkAppSlackWorkspaceByTeamId(runDbClient)(sessionTenantId, teamId);
    if (!workspace) {
      return c.json({ shouldAllowJoinFromWorkspace: false });
    }

    return c.json({
      shouldAllowJoinFromWorkspace: workspace.shouldAllowJoinFromWorkspace ?? false,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{teamId}/join-from-workspace',
    summary: 'Update Join From Workspace Setting',
    description: 'Enable or disable join from workspace for the workspace',
    operationId: 'slack-update-join-from-workspace',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: requireWorkspaceAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: JoinFromWorkspaceSettingsSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Join from workspace setting updated',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
      401: {
        description: 'Unauthorized',
      },
      404: {
        description: 'Workspace not found',
      },
      500: {
        description: 'Failed to update setting',
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');
    const { shouldAllowJoinFromWorkspace } = c.req.valid('json');

    // Get the session tenant ID for authorization
    const sessionTenantId = c.get('tenantId') as string | undefined;
    if (!sessionTenantId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Find the workspace in the database
    const workspace = await findWorkAppSlackWorkspaceByTeamId(runDbClient)(sessionTenantId, teamId);
    if (!workspace) {
      return c.json({ error: 'Workspace not found' }, 404);
    }

    try {
      // Update the join from workspace settings
      const updated = await updateWorkAppSlackWorkspace(runDbClient)(workspace.id, {
        shouldAllowJoinFromWorkspace,
      });

      if (!updated) {
        logger.error(
          { teamId, shouldAllowJoinFromWorkspace },
          'Failed to update join from workspace setting'
        );
        return c.json({ error: 'Failed to update setting' }, 500);
      }

      logger.info(
        { teamId, shouldAllowJoinFromWorkspace, workspaceId: workspace.id },
        'Updated workspace join from workspace settings'
      );

      return c.json({ success: true });
    } catch (error) {
      logger.error(
        { teamId, shouldAllowJoinFromWorkspace, error },
        'Failed to update join from workspace setting'
      );
      return c.json({ error: 'Failed to update setting' }, 500);
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{teamId}',
    summary: 'Uninstall Workspace',
    description: 'Uninstall Slack app from workspace. Accepts either teamId or connectionId.',
    operationId: 'slack-delete-workspace',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: requireWorkspaceAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Workspace uninstalled',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
      400: {
        description: 'Invalid connectionId format',
      },
      404: {
        description: 'Workspace not found',
      },
      500: {
        description: 'Failed to uninstall workspace',
      },
    },
  }),
  async (c) => {
    const { teamId: workspaceIdentifier } = c.req.valid('param');

    let teamId: string;
    let connectionId: string;

    try {
      if (workspaceIdentifier.includes(':')) {
        connectionId = workspaceIdentifier;
        const teamMatch = workspaceIdentifier.match(/T:([A-Z0-9]+)/);
        if (!teamMatch) {
          return c.json({ error: 'Invalid connectionId format' }, 400);
        }
        teamId = teamMatch[1];
      } else {
        teamId = workspaceIdentifier;
        connectionId = computeWorkspaceConnectionId({
          teamId,
          enterpriseId: undefined,
        });
      }

      const workspace = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspace) {
        return c.json({ error: 'Workspace not found' }, 404);
      }

      if (workspace.botToken) {
        const tokenRevoked = await revokeSlackToken(workspace.botToken);
        if (tokenRevoked) {
          logger.info({ teamId }, 'Revoked Slack bot token');
        } else {
          logger.warn({ teamId }, 'Failed to revoke Slack bot token, continuing with uninstall');
        }
      }

      // Delete from PostgreSQL first (recoverable), then Nango (point of no return)
      const tenantId = workspace.tenantId;

      const deletedChannelConfigs = await deleteAllWorkAppSlackChannelAgentConfigsByTeam(
        runDbClient
      )(tenantId, teamId);
      if (deletedChannelConfigs > 0) {
        logger.info(
          { teamId, deletedChannelConfigs },
          'Deleted channel configs for uninstalled workspace'
        );
      }

      const deletedMappings = await deleteAllWorkAppSlackUserMappingsByTeam(runDbClient)(
        tenantId,
        teamId
      );
      if (deletedMappings > 0) {
        logger.info({ teamId, deletedMappings }, 'Deleted user mappings for uninstalled workspace');
      }

      const dbDeleted =
        await deleteWorkAppSlackWorkspaceByNangoConnectionId(runDbClient)(connectionId);
      if (dbDeleted) {
        logger.info({ connectionId }, 'Deleted workspace from database');
      }

      // Point of no return: delete from Nango (OAuth tokens)
      const nangoSuccess = await deleteWorkspaceInstallation(connectionId);
      if (!nangoSuccess) {
        logger.error(
          { connectionId },
          'deleteWorkspaceInstallation returned false (DB already cleaned up)'
        );
      }

      clearWorkspaceConnectionCache(teamId);
      logger.info({ connectionId, teamId }, 'Deleted workspace installation and cleared cache');
      return c.json({ success: true });
    } catch (error) {
      logger.error({ error, workspaceIdentifier }, 'Failed to uninstall workspace');
      return c.json({ error: 'Failed to uninstall workspace' }, 500);
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{teamId}/channels',
    summary: 'List Channels',
    description: 'List Slack channels where the bot is a member',
    operationId: 'slack-list-channels',
    tags: ['Work Apps', 'Slack', 'Channels'],
    permission: inheritedWorkAppsAuth(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
      query: z.object({
        limit: z.coerce.number().optional().default(100),
        cursor: z.string().optional(),
        types: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'List of channels',
        content: {
          'application/json': {
            schema: z.object({
              channels: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  isPrivate: z.boolean(),
                  isShared: z.boolean(),
                  memberCount: z.number().optional(),
                  hasAgentConfig: z.boolean(),
                  agentConfig: ChannelAgentConfigResponseSchema.optional(),
                })
              ),
              nextCursor: z.string().optional(),
            }),
          },
        },
      },
      404: {
        description: 'Workspace not found',
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');
    const { limit } = c.req.valid('query');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace?.botToken || !verifyTenantOwnership(c, workspace.tenantId)) {
      return c.json({ error: 'Workspace not found or no bot token' }, 404);
    }

    const tenantId = workspace.tenantId;
    const slackClient = getSlackClient(workspace.botToken);

    try {
      const channels = await getBotMemberChannels(slackClient, limit);

      let channelConfigs: Awaited<
        ReturnType<ReturnType<typeof listWorkAppSlackChannelAgentConfigsByTeam>>
      > = [];
      try {
        channelConfigs = await listWorkAppSlackChannelAgentConfigsByTeam(runDbClient)(
          tenantId,
          teamId
        );
      } catch (configError) {
        logger.warn(
          { error: configError, teamId },
          'Failed to fetch channel configs, table may not exist yet'
        );
      }
      const configMap = new Map(channelConfigs.map((c) => [c.slackChannelId, c]));

      const agentNameMap = new Map<string, string>();
      const uniquePairs = new Map<string, { projectId: string; agentId: string }>();
      for (const config of channelConfigs) {
        const key = `${config.projectId}:${config.agentId}`;
        if (!uniquePairs.has(key)) {
          uniquePairs.set(key, { projectId: config.projectId, agentId: config.agentId });
        }
      }
      await Promise.all(
        Array.from(uniquePairs.entries()).map(async ([key, { projectId, agentId }]) => {
          try {
            const name = await lookupAgentName(tenantId, projectId, agentId);
            if (name) agentNameMap.set(key, name);
          } catch {
            logger.warn({ projectId, agentId }, 'Failed to resolve agent name');
          }
        })
      );

      const channelsWithConfig = channels.map((channel) => {
        const config = channel.id ? configMap.get(channel.id) : undefined;
        const agentNameKey = config ? `${config.projectId}:${config.agentId}` : undefined;
        return {
          id: channel.id || '',
          name: channel.name || '',
          isPrivate: channel.isPrivate ?? false,
          isShared: channel.isShared ?? false,
          memberCount: channel.memberCount,
          hasAgentConfig: !!config,
          agentConfig: config
            ? {
                projectId: config.projectId,
                agentId: config.agentId,
                agentName: (agentNameKey && agentNameMap.get(agentNameKey)) || config.agentId,
                grantAccessToMembers: config.grantAccessToMembers,
              }
            : undefined,
        };
      });

      return c.json({
        channels: channelsWithConfig,
        nextCursor: undefined,
      });
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to list channels');
      return c.json({ error: 'Failed to list channels' }, 500);
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{teamId}/channels/{channelId}/settings',
    summary: 'Get Channel Settings',
    description: 'Get default agent configuration for a specific channel',
    operationId: 'slack-get-channel-settings',
    tags: ['Work Apps', 'Slack', 'Channels'],
    permission: inheritedWorkAppsAuth(),
    request: {
      params: z.object({
        teamId: z.string(),
        channelId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Channel settings',
        content: {
          'application/json': {
            schema: z.object({
              channelId: z.string(),
              agentConfig: ChannelAgentConfigResponseSchema.optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { teamId, channelId } = c.req.valid('param');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace || !verifyTenantOwnership(c, workspace.tenantId)) {
      logger.warn({ teamId }, 'Workspace not found or tenant mismatch');
      return c.json({ channelId, agentConfig: undefined });
    }
    const tenantId = workspace.tenantId;

    const config = await findWorkAppSlackChannelAgentConfig(runDbClient)(
      tenantId,
      teamId,
      channelId
    );

    let agentName: string | undefined;
    if (config) {
      try {
        agentName = await lookupAgentName(tenantId, config.projectId, config.agentId);
      } catch {
        logger.warn({ agentId: config.agentId }, 'Failed to resolve agent name');
      }
    }

    return c.json({
      channelId,
      agentConfig: config
        ? {
            projectId: config.projectId,
            agentId: config.agentId,
            agentName: agentName || config.agentId,
            grantAccessToMembers: config.grantAccessToMembers,
          }
        : undefined,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{teamId}/channels/{channelId}/settings',
    summary: 'Set Channel Default Agent',
    description: 'Set or update the default agent for a specific channel',
    operationId: 'slack-set-channel-settings',
    tags: ['Work Apps', 'Slack', 'Channels'],
    permission: requireChannelMemberOrAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
        channelId: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              agentConfig: ChannelAgentConfigRequestSchema,
              channelName: z.string().optional(),
              channelType: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Channel settings updated',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              configId: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { teamId, channelId } = c.req.valid('param');
    const body = c.req.valid('json');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace || !verifyTenantOwnership(c, workspace.tenantId)) {
      logger.warn({ teamId }, 'Workspace not found or tenant mismatch');
      return c.json({ success: false, configId: '' });
    }
    const tenantId = workspace.tenantId;

    const config = await upsertWorkAppSlackChannelAgentConfig(runDbClient)({
      tenantId,
      slackTeamId: teamId,
      slackChannelId: channelId,
      slackChannelName: body.channelName,
      slackChannelType: body.channelType,
      projectId: body.agentConfig.projectId,
      agentId: body.agentConfig.agentId,
      grantAccessToMembers: body.agentConfig.grantAccessToMembers ?? true,
      enabled: true,
    });

    logger.info(
      { teamId, channelId, agentId: body.agentConfig.agentId },
      'Set channel default agent'
    );

    return c.json({ success: true, configId: config.id });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'put',
    path: '/{teamId}/channels/bulk',
    summary: 'Bulk Set Channel Agents',
    description: 'Apply the same agent configuration to multiple channels at once',
    operationId: 'slack-bulk-set-channel-agents',
    tags: ['Work Apps', 'Slack', 'Channels'],
    permission: requireWorkspaceAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              channelIds: z.array(z.string()).min(1),
              agentConfig: ChannelAgentConfigRequestSchema,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Channels updated',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              updated: z.number(),
              failed: z.number(),
              errors: z.array(z.object({ channelId: z.string(), error: z.string() })).optional(),
            }),
          },
        },
      },
      400: {
        description: 'Invalid request',
      },
      404: {
        description: 'Workspace not found',
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');
    const body = c.req.valid('json');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace?.botToken || !verifyTenantOwnership(c, workspace.tenantId)) {
      return c.json({ error: 'Workspace not found or no bot token' }, 404);
    }

    const tenantId = workspace.tenantId;
    const slackClient = getSlackClient(workspace.botToken);

    let channels: Awaited<ReturnType<typeof getSlackChannels>> = [];
    try {
      channels = await getSlackChannels(slackClient, 500);
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to fetch channels for bulk operation');
      return c.json({ error: 'Failed to fetch channels' }, 500);
    }
    const channelMap = new Map(channels.map((ch) => [ch.id, ch]));

    let updated = 0;
    const errors: Array<{ channelId: string; error: string }> = [];

    await Promise.all(
      body.channelIds.map(async (channelId) => {
        try {
          const channel = channelMap.get(channelId);
          if (!channel) {
            errors.push({ channelId, error: 'Channel not found' });
            return;
          }

          await upsertWorkAppSlackChannelAgentConfig(runDbClient)({
            tenantId,
            slackTeamId: teamId,
            slackChannelId: channelId,
            slackChannelName: channel.name || channelId,
            slackChannelType: 'public',
            projectId: body.agentConfig.projectId,
            agentId: body.agentConfig.agentId,
            grantAccessToMembers: body.agentConfig.grantAccessToMembers ?? true,
            enabled: true,
          });
          updated++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({ channelId, error: errorMessage });
        }
      })
    );

    logger.info(
      { teamId, agentId: body.agentConfig.agentId, updated, failed: errors.length },
      'Bulk set channel agents'
    );

    return c.json({
      success: errors.length === 0,
      updated,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{teamId}/channels/bulk',
    summary: 'Bulk Remove Channel Configs',
    description: 'Remove agent configuration from multiple channels at once',
    operationId: 'slack-bulk-delete-channel-agents',
    tags: ['Work Apps', 'Slack', 'Channels'],
    permission: requireWorkspaceAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              channelIds: z.array(z.string()).min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Configs removed',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              removed: z.number(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');
    const body = c.req.valid('json');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace || !verifyTenantOwnership(c, workspace.tenantId)) {
      logger.warn({ teamId }, 'Workspace not found or tenant mismatch');
      return c.json({ success: false, removed: 0 });
    }
    const tenantId = workspace.tenantId;

    let removed = 0;
    await Promise.all(
      body.channelIds.map(async (channelId) => {
        const deleted = await deleteWorkAppSlackChannelAgentConfig(runDbClient)(
          tenantId,
          teamId,
          channelId
        );
        if (deleted) removed++;
      })
    );

    logger.info({ teamId, removed }, 'Bulk removed channel agent configs');

    return c.json({ success: true, removed });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{teamId}/channels/{channelId}/settings',
    summary: 'Remove Channel Config',
    description: 'Remove the default agent configuration for a channel',
    operationId: 'slack-delete-channel-settings',
    tags: ['Work Apps', 'Slack', 'Channels'],
    permission: requireChannelMemberOrAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
        channelId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Channel config removed',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { teamId, channelId } = c.req.valid('param');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace || !verifyTenantOwnership(c, workspace.tenantId)) {
      logger.warn({ teamId }, 'Workspace not found or tenant mismatch');
      return c.json({ success: false });
    }
    const tenantId = workspace.tenantId;

    const deleted = await deleteWorkAppSlackChannelAgentConfig(runDbClient)(
      tenantId,
      teamId,
      channelId
    );

    logger.info({ teamId, channelId, deleted }, 'Removed channel agent config');

    return c.json({ success: deleted });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{teamId}/users',
    summary: 'List Linked Users',
    description: 'List all users linked to Inkeep in this workspace',
    operationId: 'slack-list-linked-users',
    tags: ['Work Apps', 'Slack', 'Users'],
    permission: inheritedWorkAppsAuth(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'List of linked users',
        content: {
          'application/json': {
            schema: z.object({
              linkedUsers: z.array(
                z.object({
                  id: z.string(),
                  slackUserId: z.string(),
                  slackTeamId: z.string(),
                  slackUsername: z.string().optional(),
                  slackEmail: z.string().optional(),
                  userId: z.string(),
                  linkedAt: z.string(),
                  lastUsedAt: z.string().optional(),
                })
              ),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace || !verifyTenantOwnership(c, workspace.tenantId)) {
      logger.warn({ teamId }, 'Workspace not found or tenant mismatch');
      return c.json({ linkedUsers: [] });
    }
    const tenantId = workspace.tenantId;

    const linkedUsers = await listWorkAppSlackUserMappingsByTeam(runDbClient)(tenantId, teamId);

    logger.info({ teamId, tenantId, count: linkedUsers.length }, 'Fetched linked users');

    return c.json({
      linkedUsers: linkedUsers.map((link) => ({
        id: link.id,
        slackUserId: link.slackUserId,
        slackTeamId: link.slackTeamId,
        slackUsername: link.slackUsername || undefined,
        slackEmail: link.slackEmail || undefined,
        userId: link.inkeepUserId,
        linkedAt: link.linkedAt,
        lastUsedAt: link.lastUsedAt || undefined,
      })),
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{teamId}/health',
    summary: 'Check Workspace Health',
    description:
      'Verify the bot token is valid and check permissions. Returns bot info and permission status.',
    operationId: 'slack-workspace-health',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: inheritedWorkAppsAuth(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Health check result',
        content: {
          'application/json': {
            schema: z.object({
              healthy: z.boolean(),
              botId: z.string().optional(),
              botName: z.string().optional(),
              teamId: z.string().optional(),
              teamName: z.string().optional(),
              permissions: z.object({
                canPostMessages: z.boolean(),
                canReadChannels: z.boolean(),
                canReadHistory: z.boolean(),
              }),
              error: z.string().optional(),
            }),
          },
        },
      },
      404: {
        description: 'Workspace not found',
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);

    if (!workspace?.botToken || !verifyTenantOwnership(c, workspace.tenantId)) {
      return c.json({
        healthy: false,
        permissions: {
          canPostMessages: false,
          canReadChannels: false,
          canReadHistory: false,
        },
        error: 'Workspace not found or no bot token available',
      });
    }

    try {
      const slackClient = getSlackClient(workspace.botToken);

      const authResult = await slackClient.auth.test();

      if (!authResult.ok) {
        return c.json({
          healthy: false,
          permissions: {
            canPostMessages: false,
            canReadChannels: false,
            canReadHistory: false,
          },
          error: 'Bot token is invalid or revoked',
        });
      }

      const permissions = {
        canPostMessages: true,
        canReadChannels: true,
        canReadHistory: true,
      };

      try {
        await slackClient.conversations.list({ limit: 1 });
      } catch (e) {
        permissions.canReadChannels = false;
        logger.debug({ error: e }, 'Channel read permission check failed');
      }

      logger.info(
        { teamId, botId: authResult.user_id, permissions },
        'Workspace health check completed'
      );

      return c.json({
        healthy: true,
        botId: authResult.user_id,
        botName: authResult.user,
        teamId: authResult.team_id,
        teamName: authResult.team,
        permissions,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, teamId }, 'Health check failed');

      return c.json({
        healthy: false,
        permissions: {
          canPostMessages: false,
          canReadChannels: false,
          canReadHistory: false,
        },
        error: errorMessage,
      });
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{teamId}/test-message',
    summary: 'Send Test Message',
    description: 'Send a test message to verify the bot is working correctly.',
    operationId: 'slack-test-message',
    tags: ['Work Apps', 'Slack', 'Workspaces'],
    permission: requireWorkspaceAdmin(),
    request: {
      params: z.object({
        teamId: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              channelId: z.string(),
              message: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Test message sent',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              messageTs: z.string().optional(),
              error: z.string().optional(),
            }),
          },
        },
      },
      400: {
        description: 'Invalid request',
      },
      404: {
        description: 'Workspace not found',
      },
    },
  }),
  async (c) => {
    const { teamId } = c.req.valid('param');
    const { channelId, message } = c.req.valid('json');

    const workspace = await findWorkspaceConnectionByTeamId(teamId);

    if (!workspace?.botToken || !verifyTenantOwnership(c, workspace.tenantId)) {
      return c.json(
        { success: false, error: 'Workspace not found or no bot token available' },
        404
      );
    }

    try {
      const slackClient = getSlackClient(workspace.botToken);

      const testMessage =
        message || '*Test message from Inkeep*\n\nYour Slack integration is working correctly.';

      const result = await slackClient.chat.postMessage({
        channel: channelId,
        text: testMessage,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: testMessage,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '_This is a test message from the Inkeep dashboard_',
              },
            ],
          },
        ],
      });

      if (!result.ok) {
        return c.json({ success: false, error: result.error || 'Failed to send message' });
      }

      logger.info({ teamId, channelId, messageTs: result.ts }, 'Test message sent');

      return c.json({
        success: true,
        messageTs: result.ts,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, teamId, channelId }, 'Failed to send test message');

      return c.json({ success: false, error: errorMessage });
    }
  }
);

export default app;
