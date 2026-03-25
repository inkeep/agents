import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  apiKeys,
  contextCache,
  workAppGitHubMcpToolAccessMode,
  workAppGitHubMcpToolRepositoryAccess,
  workAppSlackChannelAgentConfigs,
  workAppSlackMcpToolAccessConfig,
} from '../../db/runtime/runtime-schema';
import type { ProjectScopeConfig } from '../../types/utility';
import { projectScopedWhere } from '../manage/scope-helpers';

export const listGitHubToolAccessByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        id: workAppGitHubMcpToolRepositoryAccess.id,
        toolId: workAppGitHubMcpToolRepositoryAccess.toolId,
      })
      .from(workAppGitHubMcpToolRepositoryAccess)
      .where(projectScopedWhere(workAppGitHubMcpToolRepositoryAccess, params.scopes));
  };

export const listGitHubToolAccessModeByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        toolId: workAppGitHubMcpToolAccessMode.toolId,
      })
      .from(workAppGitHubMcpToolAccessMode)
      .where(projectScopedWhere(workAppGitHubMcpToolAccessMode, params.scopes));
  };

export const listSlackToolAccessConfigByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        toolId: workAppSlackMcpToolAccessConfig.toolId,
      })
      .from(workAppSlackMcpToolAccessConfig)
      .where(projectScopedWhere(workAppSlackMcpToolAccessConfig, params.scopes));
  };

export const listContextCacheByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        id: contextCache.id,
        contextConfigId: contextCache.contextConfigId,
      })
      .from(contextCache)
      .where(projectScopedWhere(contextCache, params.scopes));
  };

export const listApiKeysByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        id: apiKeys.id,
        agentId: apiKeys.agentId,
      })
      .from(apiKeys)
      .where(projectScopedWhere(apiKeys, params.scopes));
  };

export const listSlackChannelAgentConfigsByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return db
      .select({
        id: workAppSlackChannelAgentConfigs.id,
        agentId: workAppSlackChannelAgentConfigs.agentId,
      })
      .from(workAppSlackChannelAgentConfigs)
      .where(projectScopedWhere(workAppSlackChannelAgentConfigs, params.scopes));
  };
