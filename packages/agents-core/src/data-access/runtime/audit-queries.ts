import { and, eq } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  apiKeys,
  contextCache,
  workAppGitHubMcpToolAccessMode,
  workAppGitHubMcpToolRepositoryAccess,
  workAppSlackChannelAgentConfigs,
  workAppSlackMcpToolAccessConfig,
} from '../../db/runtime/runtime-schema';

type ProjectScopes = { tenantId: string; projectId: string };

export const listGitHubToolAccessByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopes }) => {
    return db
      .select({
        id: workAppGitHubMcpToolRepositoryAccess.id,
        toolId: workAppGitHubMcpToolRepositoryAccess.toolId,
      })
      .from(workAppGitHubMcpToolRepositoryAccess)
      .where(
        and(
          eq(workAppGitHubMcpToolRepositoryAccess.tenantId, params.scopes.tenantId),
          eq(workAppGitHubMcpToolRepositoryAccess.projectId, params.scopes.projectId)
        )
      );
  };

export const listGitHubToolAccessModeByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopes }) => {
    return db
      .select({
        toolId: workAppGitHubMcpToolAccessMode.toolId,
      })
      .from(workAppGitHubMcpToolAccessMode)
      .where(
        and(
          eq(workAppGitHubMcpToolAccessMode.tenantId, params.scopes.tenantId),
          eq(workAppGitHubMcpToolAccessMode.projectId, params.scopes.projectId)
        )
      );
  };

export const listSlackToolAccessConfigByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopes }) => {
    return db
      .select({
        toolId: workAppSlackMcpToolAccessConfig.toolId,
      })
      .from(workAppSlackMcpToolAccessConfig)
      .where(
        and(
          eq(workAppSlackMcpToolAccessConfig.tenantId, params.scopes.tenantId),
          eq(workAppSlackMcpToolAccessConfig.projectId, params.scopes.projectId)
        )
      );
  };

export const listContextCacheByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopes }) => {
    return db
      .select({
        id: contextCache.id,
        contextConfigId: contextCache.contextConfigId,
      })
      .from(contextCache)
      .where(
        and(
          eq(contextCache.tenantId, params.scopes.tenantId),
          eq(contextCache.projectId, params.scopes.projectId)
        )
      );
  };

export const listApiKeysByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopes }) => {
    return db
      .select({
        id: apiKeys.id,
        agentId: apiKeys.agentId,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.tenantId, params.scopes.tenantId),
          eq(apiKeys.projectId, params.scopes.projectId)
        )
      );
  };

export const listSlackChannelAgentConfigsByProject =
  (db: AgentsRunDatabaseClient) => async (params: { scopes: ProjectScopes }) => {
    return db
      .select({
        id: workAppSlackChannelAgentConfigs.id,
        agentId: workAppSlackChannelAgentConfigs.agentId,
      })
      .from(workAppSlackChannelAgentConfigs)
      .where(
        and(
          eq(workAppSlackChannelAgentConfigs.tenantId, params.scopes.tenantId),
          eq(workAppSlackChannelAgentConfigs.projectId, params.scopes.projectId)
        )
      );
  };
