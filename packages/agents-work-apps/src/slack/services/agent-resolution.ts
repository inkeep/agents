/**
 * Slack Agent Resolution Service
 *
 * Determines which agent to use for a given Slack interaction.
 *
 * For @mentions (bot interactions):
 * - Uses Channel > Workspace defaults (admin-controlled)
 *
 * For /slash commands (user interactions):
 * - User personal default > Channel > Workspace
 * - Users can set their own default via /inkeep settings
 */

import {
  findWorkAppSlackChannelAgentConfig,
  findWorkAppSlackUserSettings,
} from '@inkeep/agents-core';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { getWorkspaceDefaultAgentFromNango } from './nango';

const logger = getLogger('slack-agent-resolution');

/** Configuration for a resolved agent */
export interface ResolvedAgentConfig {
  projectId: string;
  agentId: string;
  agentName?: string;
  source: 'channel' | 'workspace' | 'user' | 'none';
}

export interface AgentResolutionParams {
  tenantId: string;
  teamId: string;
  channelId?: string;
  userId?: string;
}

/**
 * Resolve the effective agent configuration for a Slack slash command.
 * Priority: User personal default > Channel override > Workspace default
 *
 * @param params - Resolution parameters including tenant, team, channel, and user IDs
 * @returns The resolved agent configuration, or null if no agent is configured
 */
export async function resolveEffectiveAgent(
  params: AgentResolutionParams
): Promise<ResolvedAgentConfig | null> {
  const { tenantId, teamId, channelId, userId } = params;

  logger.debug({ tenantId, teamId, channelId, userId }, 'Resolving effective agent');

  // Priority 1: User's personal default (set via /inkeep settings)
  if (userId) {
    const userSettings = await findWorkAppSlackUserSettings(runDbClient)(tenantId, teamId, userId);

    if (userSettings?.defaultAgentId && userSettings.defaultProjectId) {
      logger.info(
        { userId, agentId: userSettings.defaultAgentId, source: 'user' },
        'Resolved agent from user settings'
      );
      return {
        projectId: userSettings.defaultProjectId,
        agentId: userSettings.defaultAgentId,
        agentName: userSettings.defaultAgentName || undefined,
        source: 'user',
      };
    }
  }

  // Priority 2: Channel override (admin-configured)
  if (channelId) {
    const channelConfig = await findWorkAppSlackChannelAgentConfig(runDbClient)(
      tenantId,
      teamId,
      channelId
    );

    if (channelConfig?.enabled) {
      logger.info(
        { channelId, agentId: channelConfig.agentId, source: 'channel' },
        'Resolved agent from channel config'
      );
      return {
        projectId: channelConfig.projectId,
        agentId: channelConfig.agentId,
        agentName: channelConfig.agentName || undefined,
        source: 'channel',
      };
    }
  }

  // Priority 3: Workspace default (admin-configured)
  const workspaceConfig = await getWorkspaceDefaultAgentFromNango(teamId);

  if (workspaceConfig?.agentId && workspaceConfig.projectId) {
    logger.info(
      { teamId, agentId: workspaceConfig.agentId, source: 'workspace' },
      'Resolved agent from workspace config'
    );
    return {
      projectId: workspaceConfig.projectId,
      agentId: workspaceConfig.agentId,
      agentName: workspaceConfig.agentName,
      source: 'workspace',
    };
  }

  logger.debug({ tenantId, teamId, channelId, userId }, 'No agent configuration found');
  return null;
}

/**
 * Get all agent configuration sources for debugging and display purposes.
 * Returns each level of configuration and the effective result.
 *
 * @param params - Resolution parameters
 * @returns Object containing channel, workspace, user configs, and the effective choice
 */
export async function getAgentConfigSources(params: AgentResolutionParams): Promise<{
  channelConfig: ResolvedAgentConfig | null;
  workspaceConfig: ResolvedAgentConfig | null;
  userConfig: ResolvedAgentConfig | null;
  effective: ResolvedAgentConfig | null;
}> {
  const { tenantId, teamId, channelId, userId } = params;

  let channelConfig: ResolvedAgentConfig | null = null;
  let workspaceConfig: ResolvedAgentConfig | null = null;
  let userConfig: ResolvedAgentConfig | null = null;

  if (channelId) {
    const config = await findWorkAppSlackChannelAgentConfig(runDbClient)(
      tenantId,
      teamId,
      channelId
    );
    if (config?.enabled) {
      channelConfig = {
        projectId: config.projectId,
        agentId: config.agentId,
        agentName: config.agentName || undefined,
        source: 'channel',
      };
    }
  }

  const wsConfig = await getWorkspaceDefaultAgentFromNango(teamId);
  if (wsConfig?.agentId && wsConfig.projectId) {
    workspaceConfig = {
      projectId: wsConfig.projectId,
      agentId: wsConfig.agentId,
      agentName: wsConfig.agentName,
      source: 'workspace',
    };
  }

  if (userId) {
    const settings = await findWorkAppSlackUserSettings(runDbClient)(tenantId, teamId, userId);
    if (settings?.defaultAgentId && settings.defaultProjectId) {
      userConfig = {
        projectId: settings.defaultProjectId,
        agentId: settings.defaultAgentId,
        agentName: settings.defaultAgentName || undefined,
        source: 'user',
      };
    }
  }

  const effective = userConfig || channelConfig || workspaceConfig;

  return {
    channelConfig,
    workspaceConfig,
    userConfig,
    effective,
  };
}
