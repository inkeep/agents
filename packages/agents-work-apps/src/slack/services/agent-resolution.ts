/**
 * Slack Agent Resolution Service
 *
 * Determines which agent to use for a given Slack interaction.
 * Priority: Channel default > Workspace default (all admin-controlled)
 */

import { findWorkAppSlackChannelAgentConfig } from '@inkeep/agents-core';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { fetchAgentsForProject, fetchProjectsForTenant } from './events/utils';
import { getWorkspaceDefaultAgentFromNango } from './nango';

const logger = getLogger('slack-agent-resolution');

const AGENT_NAME_CACHE_TTL_MS = 5 * 60 * 1000;
const AGENT_NAME_CACHE_MAX_SIZE = 500;
const agentNameCache = new Map<string, { name: string | null; expiresAt: number }>();

export async function lookupAgentName(
  tenantId: string,
  projectId: string,
  agentId: string,
  options?: { skipCache?: boolean }
): Promise<string | undefined> {
  const cacheKey = `${tenantId}:${projectId}:${agentId}`;
  if (!options?.skipCache) {
    const cached = agentNameCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.name || undefined;
    }
  }

  const agents = await fetchAgentsForProject(tenantId, projectId);

  for (const agent of agents) {
    const key = `${tenantId}:${projectId}:${agent.id}`;
    agentNameCache.set(key, {
      name: agent.name || null,
      expiresAt: Date.now() + AGENT_NAME_CACHE_TTL_MS,
    });
  }

  if (agentNameCache.size > AGENT_NAME_CACHE_MAX_SIZE) {
    const now = Date.now();
    for (const [key, entry] of agentNameCache) {
      if (entry.expiresAt <= now) {
        agentNameCache.delete(key);
      }
    }
    if (agentNameCache.size > AGENT_NAME_CACHE_MAX_SIZE) {
      const excess = agentNameCache.size - AGENT_NAME_CACHE_MAX_SIZE;
      const keys = agentNameCache.keys();
      for (let i = 0; i < excess; i++) {
        const { value } = keys.next();
        if (value) agentNameCache.delete(value);
      }
    }
  }

  const found = agents.find((a) => a.id === agentId);
  return found?.name || undefined;
}

const PROJECT_NAME_CACHE_TTL_MS = 5 * 60 * 1000;
const PROJECT_NAME_CACHE_MAX_SIZE = 200;
const projectNameCache = new Map<string, { name: string | null; expiresAt: number }>();

export async function lookupProjectName(
  tenantId: string,
  projectId: string,
  options?: { skipCache?: boolean }
): Promise<string | undefined> {
  const cacheKey = `${tenantId}:${projectId}`;
  if (!options?.skipCache) {
    const cached = projectNameCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.name || undefined;
    }
  }

  const projects = await fetchProjectsForTenant(tenantId);

  for (const project of projects) {
    const key = `${tenantId}:${project.id}`;
    projectNameCache.set(key, {
      name: project.name || null,
      expiresAt: Date.now() + PROJECT_NAME_CACHE_TTL_MS,
    });
  }

  if (projectNameCache.size > PROJECT_NAME_CACHE_MAX_SIZE) {
    const now = Date.now();
    for (const [key, entry] of projectNameCache) {
      if (entry.expiresAt <= now) {
        projectNameCache.delete(key);
      }
    }
    if (projectNameCache.size > PROJECT_NAME_CACHE_MAX_SIZE) {
      const excess = projectNameCache.size - PROJECT_NAME_CACHE_MAX_SIZE;
      const keys = projectNameCache.keys();
      for (let i = 0; i < excess; i++) {
        const { value } = keys.next();
        if (value) projectNameCache.delete(value);
      }
    }
  }

  const found = projects.find((p) => p.id === projectId);
  return found?.name || undefined;
}

/** Configuration for a resolved agent */
export interface ResolvedAgentConfig {
  projectId: string;
  projectName?: string;
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

  let result: ResolvedAgentConfig | null = null;

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
      result = {
        projectId: channelConfig.projectId,
        agentId: channelConfig.agentId,
        source: 'channel',
        grantAccessToMembers: channelConfig.grantAccessToMembers,
      };
    }
  }

  // Priority 2: Workspace default (admin-configured)
  if (!result) {
    const workspaceConfig = await getWorkspaceDefaultAgentFromNango(teamId);

    if (workspaceConfig?.agentId && workspaceConfig.projectId) {
      logger.info(
        { teamId, agentId: workspaceConfig.agentId, source: 'workspace' },
        'Resolved agent from workspace config'
      );
      result = {
        projectId: workspaceConfig.projectId,
        projectName: workspaceConfig.projectName,
        agentId: workspaceConfig.agentId,
        agentName: workspaceConfig.agentName,
        source: 'workspace',
        grantAccessToMembers: workspaceConfig.grantAccessToMembers ?? true,
      };
    }
  }

  // Always enrich agent name from manage API
  if (result) {
    const name = await lookupAgentName(tenantId, result.projectId, result.agentId);
    if (name) {
      result.agentName = name;
    }
  }

  if (result) {
    const projectName = await lookupProjectName(tenantId, result.projectId);
    if (projectName) {
      result.projectName = projectName;
    }
  }

  if (!result) {
    logger.debug({ tenantId, teamId, channelId }, 'No agent configuration found');
  }

  return result;
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
      source: 'workspace',
      grantAccessToMembers: wsConfig.grantAccessToMembers ?? true,
    };
  }

  const configsToEnrich = [channelConfig, workspaceConfig].filter(
    (c): c is ResolvedAgentConfig => c !== null
  );
  await Promise.all(
    configsToEnrich.map(async (config) => {
      const [agentName, projectName] = await Promise.all([
        lookupAgentName(tenantId, config.projectId, config.agentId),
        lookupProjectName(tenantId, config.projectId),
      ]);
      if (agentName) config.agentName = agentName;
      if (projectName) config.projectName = projectName;
    })
  );

  return {
    channelConfig,
    workspaceConfig,
    effective: channelConfig || workspaceConfig,
  };
}
