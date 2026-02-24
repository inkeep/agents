/**
 * Slack Agent Resolution Service
 *
 * Determines which agent to use for a given Slack interaction.
 * Priority: Channel default > Workspace default (all admin-controlled)
 */

import { findWorkAppSlackChannelAgentConfig } from '@inkeep/agents-core';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { getWorkspaceDefaultAgentFromNango } from './nango';

const logger = getLogger('slack-agent-resolution');

/** Configuration for a resolved agent */
export interface ResolvedAgentConfig {
  projectId: string;
  agentId: string;
  agentName?: string;
  source: 'channel' | 'workspace' | 'none';
  grantAccessToMembers: boolean;
}

export interface AgentResolutionParams {
  tenantId: string;
  teamId: string;
  channelId?: string;
  userId?: string;
}

/**
 * Resolve the effective agent configuration.
 * Priority: Channel default > Workspace default
 *
 * @param params - Resolution parameters including tenant, team, and channel IDs
 * @returns The resolved agent configuration, or null if no agent is configured
 */
export async function resolveEffectiveAgent(
  params: AgentResolutionParams
): Promise<ResolvedAgentConfig | null> {
  const { tenantId, teamId, channelId } = params;

  logger.debug({ tenantId, teamId, channelId }, 'Resolving effective agent');

  // Priority 1: Channel default (admin-configured)
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
        grantAccessToMembers: channelConfig.grantAccessToMembers,
      };
    }
  }

  // Priority 2: Workspace default (admin-configured)
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
      grantAccessToMembers: workspaceConfig.grantAccessToMembers ?? true,
    };
  }

  logger.debug({ tenantId, teamId, channelId }, 'No agent configuration found');
  return null;
}

/**
 * Get all agent configuration sources for display purposes.
 *
 * @param params - Resolution parameters
 * @returns Object containing channel, workspace configs, and the effective choice
 */
export async function getAgentConfigSources(params: AgentResolutionParams): Promise<{
  channelConfig: ResolvedAgentConfig | null;
  workspaceConfig: ResolvedAgentConfig | null;
  effective: ResolvedAgentConfig | null;
}> {
  const { tenantId, teamId, channelId } = params;

  let channelConfig: ResolvedAgentConfig | null = null;
  let workspaceConfig: ResolvedAgentConfig | null = null;

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
        grantAccessToMembers: config.grantAccessToMembers,
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
      grantAccessToMembers: wsConfig.grantAccessToMembers ?? true,
    };
  }

  const effective = channelConfig || workspaceConfig;

  return {
    channelConfig,
    workspaceConfig,
    effective,
  };
}
