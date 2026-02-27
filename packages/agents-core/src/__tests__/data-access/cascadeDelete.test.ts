import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cascadeDeleteByAgent,
  cascadeDeleteByBranch,
  cascadeDeleteByContextConfig,
  cascadeDeleteByProject,
  cascadeDeleteBySubAgent,
  cascadeDeleteByTool,
  cascadeDeleteGitHubAccessByProject,
} from '../../data-access/runtime/cascade-delete';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  apiKeys,
  contextCache,
  conversations,
  messages,
  organization,
  tasks,
  workAppGitHubInstallations,
  workAppGitHubMcpToolAccessMode,
  workAppGitHubMcpToolRepositoryAccess,
  workAppGitHubProjectAccessMode,
  workAppGitHubProjectRepositoryAccess,
  workAppGitHubRepositories,
  workAppSlackChannelAgentConfigs,
  workAppSlackWorkspaces,
} from '../../db/runtime/runtime-schema';
import { generateId } from '../../utils/conversations';
import type { ResolvedRef } from '../../validation/dolt-schemas';
import { testRunDbClient } from '../setup';

describe('Cascade Delete Utilities', () => {
  let db: AgentsRunDatabaseClient;
  const tenantId = 'test-tenant';
  const projectId = 'test-project';
  const agentId = 'test-agent';
  const subAgentId = 'test-sub-agent';
  const branch1Ref: ResolvedRef = {
    type: 'branch',
    name: 'tenant_project_branch1',
    hash: 'abc123',
  };
  const branch2Ref: ResolvedRef = {
    type: 'branch',
    name: 'tenant_project_branch2',
    hash: 'def456',
  };

  beforeAll(async () => {
    db = testRunDbClient;
  });

  beforeEach(async () => {
    // Clean up all runtime DB tables
    await db.delete(contextCache);
    await db.delete(messages);
    await db.delete(conversations);
    await db.delete(tasks);
    await db.delete(apiKeys);
    await db.delete(workAppSlackChannelAgentConfigs);
    await db.delete(workAppSlackWorkspaces);

    // Create test organization
    await db.insert(organization).values({
      id: tenantId,
      name: 'Test Organization',
      slug: 'test-organization',
      createdAt: new Date(),
      metadata: null,
    });
  });

  describe('cascadeDeleteByBranch', () => {
    it('should delete all runtime entities for a specific branch', async () => {
      // Create entities on branch1
      const conv1Id = generateId();
      const task1Id = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: conv1Id,
        activeSubAgentId: subAgentId,
        ref: branch1Ref,
      });
      await db.insert(tasks).values({
        tenantId,
        projectId,
        id: task1Id,
        agentId,
        subAgentId,
        contextId: 'ctx1',
        ref: branch1Ref,
        status: 'pending',
      });
      await db.insert(contextCache).values({
        tenantId,
        projectId,
        id: generateId(),
        conversationId: conv1Id,
        contextConfigId: 'config1',
        contextVariableKey: 'key1',
        ref: branch1Ref,
        value: {},
      });

      // Create entities on branch2
      const conv2Id = generateId();
      const task2Id = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: conv2Id,
        activeSubAgentId: subAgentId,
        ref: branch2Ref,
      });
      await db.insert(tasks).values({
        tenantId,
        projectId,
        id: task2Id,
        agentId,
        subAgentId,
        contextId: 'ctx2',
        ref: branch2Ref,
        status: 'pending',
      });

      // Delete branch1
      const result = await cascadeDeleteByBranch(db)({
        scopes: { tenantId, projectId },
        fullBranchName: branch1Ref.name,
      });

      // Verify branch1 entities are deleted
      expect(result.conversationsDeleted).toBe(1);
      expect(result.tasksDeleted).toBe(1);
      expect(result.contextCacheDeleted).toBe(1);

      // Verify branch2 entities still exist
      const remainingConvs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.projectId, projectId));
      expect(remainingConvs).toHaveLength(1);
      expect(remainingConvs[0].id).toBe(conv2Id);

      const remainingTasks = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
      expect(remainingTasks).toHaveLength(1);
      expect(remainingTasks[0].id).toBe(task2Id);
    });
  });

  describe('cascadeDeleteByProject', () => {
    it('should delete all runtime entities for a project on a specific branch', async () => {
      const project1 = 'project-1';
      const project2 = 'project-2';

      // Create entities for project1 on branch1
      const conv1Id = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId: project1,
        id: conv1Id,
        activeSubAgentId: subAgentId,
        ref: branch1Ref,
      });
      await db.insert(tasks).values({
        tenantId,
        projectId: project1,
        id: generateId(),
        agentId,
        subAgentId,
        contextId: 'ctx1',
        ref: branch1Ref,
        status: 'pending',
      });

      // Create entities for project1 on branch2 (should NOT be deleted)
      const conv1Branch2Id = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId: project1,
        id: conv1Branch2Id,
        activeSubAgentId: subAgentId,
        ref: branch2Ref,
      });

      // Create entities for project2 on branch1 (should NOT be deleted)
      const conv2Id = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId: project2,
        id: conv2Id,
        activeSubAgentId: subAgentId,
        ref: branch1Ref,
      });

      // Delete project1 on branch1
      const result = await cascadeDeleteByProject(db)({
        scopes: { tenantId, projectId: project1 },
        fullBranchName: branch1Ref.name,
      });

      // Verify project1 branch1 entities are deleted
      expect(result.conversationsDeleted).toBe(1);
      expect(result.tasksDeleted).toBe(1);

      // Verify project1 branch2 entities still exist
      const project1Branch2Convs = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.projectId, project1), eq(conversations.id, conv1Branch2Id)));
      expect(project1Branch2Convs).toHaveLength(1);

      // Verify project2 entities still exist
      const project2Convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.projectId, project2));
      expect(project2Convs).toHaveLength(1);
    });

    it('should delete Slack channel configs for the project', async () => {
      const project1 = 'project-1';
      const project2 = 'project-2';

      await db.insert(workAppSlackChannelAgentConfigs).values({
        id: 'wscac_test1',
        tenantId,
        slackTeamId: 'T_TEAM1',
        slackChannelId: 'C_CHAN1',
        projectId: project1,
        agentId: 'agent-1',
        enabled: true,
        grantAccessToMembers: true,
      });
      await db.insert(workAppSlackChannelAgentConfigs).values({
        id: 'wscac_test2',
        tenantId,
        slackTeamId: 'T_TEAM1',
        slackChannelId: 'C_CHAN2',
        projectId: project2,
        agentId: 'agent-2',
        enabled: true,
        grantAccessToMembers: true,
      });

      const result = await cascadeDeleteByProject(db)({
        scopes: { tenantId, projectId: project1 },
        fullBranchName: branch1Ref.name,
      });

      expect(result.slackChannelConfigsDeleted).toBe(1);

      const remaining = await db
        .select()
        .from(workAppSlackChannelAgentConfigs)
        .where(eq(workAppSlackChannelAgentConfigs.tenantId, tenantId));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].projectId).toBe(project2);
    });

    it('should delete API keys for the entire project (branch-agnostic)', async () => {
      // Create API keys for project
      await db.insert(apiKeys).values({
        tenantId,
        projectId,
        id: generateId(),
        agentId,
        publicId: generateId(),
        keyHash: 'hash1',
        keyPrefix: 'ak_',
      });
      await db.insert(apiKeys).values({
        tenantId,
        projectId,
        id: generateId(),
        agentId,
        publicId: generateId(),
        keyHash: 'hash2',
        keyPrefix: 'ak_',
      });

      // Delete project (API keys are branch-agnostic)
      const result = await cascadeDeleteByProject(db)({
        scopes: { tenantId, projectId },
        fullBranchName: branch1Ref.name,
      });

      expect(result.apiKeysDeleted).toBe(2);

      const remainingKeys = await db.select().from(apiKeys).where(eq(apiKeys.projectId, projectId));
      expect(remainingKeys).toHaveLength(0);
    });
  });

  describe('cascadeDeleteByAgent', () => {
    it('should delete tasks and conversations for agent subAgents on a specific branch', async () => {
      const subAgent1 = 'sub-agent-1';
      const subAgent2 = 'sub-agent-2';

      // Create conversation with subAgent1 active
      const conv1Id = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: conv1Id,
        activeSubAgentId: subAgent1,
        ref: branch1Ref,
      });

      // Create task for agent
      await db.insert(tasks).values({
        tenantId,
        projectId,
        id: generateId(),
        agentId,
        subAgentId: subAgent1,
        contextId: 'ctx1',
        ref: branch1Ref,
        status: 'pending',
      });

      // Create conversation with different subAgent (should be deleted since we pass both)
      const conv2Id = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: conv2Id,
        activeSubAgentId: subAgent2,
        ref: branch1Ref,
      });

      // Create API key for agent
      await db.insert(apiKeys).values({
        tenantId,
        projectId,
        id: generateId(),
        agentId,
        publicId: generateId(),
        keyHash: 'hash1',
        keyPrefix: 'ak_',
      });

      // Delete agent with both subAgents
      const result = await cascadeDeleteByAgent(db)({
        scopes: { tenantId, projectId, agentId },
        fullBranchName: branch1Ref.name,
        subAgentIds: [subAgent1, subAgent2],
      });

      expect(result.conversationsDeleted).toBe(2);
      expect(result.tasksDeleted).toBe(1);
      expect(result.apiKeysDeleted).toBe(1);

      // Verify all entities are deleted
      const remainingConvs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.projectId, projectId));
      expect(remainingConvs).toHaveLength(0);
    });

    it('should delete Slack channel configs for the agent', async () => {
      await db.insert(workAppSlackChannelAgentConfigs).values({
        id: 'wscac_test1',
        tenantId,
        slackTeamId: 'T_TEAM1',
        slackChannelId: 'C_CHAN1',
        projectId,
        agentId,
        enabled: true,
        grantAccessToMembers: true,
      });
      await db.insert(workAppSlackChannelAgentConfigs).values({
        id: 'wscac_test2',
        tenantId,
        slackTeamId: 'T_TEAM1',
        slackChannelId: 'C_CHAN2',
        projectId,
        agentId: 'other-agent',
        enabled: true,
        grantAccessToMembers: true,
      });

      const result = await cascadeDeleteByAgent(db)({
        scopes: { tenantId, projectId, agentId },
        fullBranchName: branch1Ref.name,
        subAgentIds: [],
      });

      expect(result.slackChannelConfigsDeleted).toBe(1);

      const remaining = await db
        .select()
        .from(workAppSlackChannelAgentConfigs)
        .where(eq(workAppSlackChannelAgentConfigs.tenantId, tenantId));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].agentId).toBe('other-agent');
    });

    it('should not delete conversations for other agents subAgents', async () => {
      const agent1SubAgent = 'agent1-sub';
      const agent2SubAgent = 'agent2-sub';

      // Create conversation for agent1's subAgent
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: generateId(),
        activeSubAgentId: agent1SubAgent,
        ref: branch1Ref,
      });

      // Create conversation for agent2's subAgent (different agent)
      const agent2ConvId = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: agent2ConvId,
        activeSubAgentId: agent2SubAgent,
        ref: branch1Ref,
      });

      // Delete agent1 (only agent1's subAgents)
      await cascadeDeleteByAgent(db)({
        scopes: { tenantId, projectId, agentId: 'agent1' },
        fullBranchName: branch1Ref.name,
        subAgentIds: [agent1SubAgent],
      });

      // Verify agent2's conversation still exists
      const remainingConvs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.projectId, projectId));
      expect(remainingConvs).toHaveLength(1);
      expect(remainingConvs[0].id).toBe(agent2ConvId);
    });

    it('should clear workspace default agent when agent is deleted', async () => {
      const now = new Date().toISOString();
      await db.insert(workAppSlackWorkspaces).values({
        id: 'wsw_test1',
        tenantId,
        slackTeamId: 'T_TEAM1',
        nangoConnectionId: 'T:T_TEAM1',
        defaultAgentId: agentId,
        defaultProjectId: projectId,
        defaultGrantAccessToMembers: true,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(workAppSlackWorkspaces).values({
        id: 'wsw_test2',
        tenantId,
        slackTeamId: 'T_TEAM2',
        nangoConnectionId: 'T:T_TEAM2',
        defaultAgentId: 'other-agent',
        defaultProjectId: projectId,
        defaultGrantAccessToMembers: true,
        createdAt: now,
        updatedAt: now,
      });

      const result = await cascadeDeleteByAgent(db)({
        scopes: { tenantId, projectId, agentId },
        fullBranchName: branch1Ref.name,
        subAgentIds: [],
      });

      expect(result.slackWorkspaceDefaultsCleared).toBe(1);

      const ws1 = await db
        .select()
        .from(workAppSlackWorkspaces)
        .where(eq(workAppSlackWorkspaces.id, 'wsw_test1'));
      expect(ws1[0].defaultAgentId).toBeNull();
      expect(ws1[0].defaultProjectId).toBeNull();

      const ws2 = await db
        .select()
        .from(workAppSlackWorkspaces)
        .where(eq(workAppSlackWorkspaces.id, 'wsw_test2'));
      expect(ws2[0].defaultAgentId).toBe('other-agent');
    });
  });

  describe('cascadeDeleteBySubAgent', () => {
    it('should delete conversations and tasks for a specific subAgent on a branch', async () => {
      // Create conversation with this subAgent active
      const convId = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: convId,
        activeSubAgentId: subAgentId,
        ref: branch1Ref,
      });

      // Create context cache for this conversation
      await db.insert(contextCache).values({
        tenantId,
        projectId,
        id: generateId(),
        conversationId: convId,
        contextConfigId: 'config1',
        contextVariableKey: 'key1',
        ref: branch1Ref,
        value: {},
      });

      // Create task for this subAgent
      await db.insert(tasks).values({
        tenantId,
        projectId,
        id: generateId(),
        agentId,
        subAgentId,
        contextId: 'ctx1',
        ref: branch1Ref,
        status: 'pending',
      });

      // Delete subAgent
      const result = await cascadeDeleteBySubAgent(db)({
        scopes: { tenantId, projectId },
        subAgentId,
        fullBranchName: branch1Ref.name,
      });

      expect(result.conversationsDeleted).toBe(1);
      expect(result.contextCacheDeleted).toBe(1);
      expect(result.tasksDeleted).toBe(1);
    });

    it('should not delete entities on other branches', async () => {
      // Create conversation on branch1
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: generateId(),
        activeSubAgentId: subAgentId,
        ref: branch1Ref,
      });

      // Create conversation on branch2
      const branch2ConvId = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: branch2ConvId,
        activeSubAgentId: subAgentId,
        ref: branch2Ref,
      });

      // Delete subAgent on branch1
      await cascadeDeleteBySubAgent(db)({
        scopes: { tenantId, projectId },
        subAgentId,
        fullBranchName: branch1Ref.name,
      });

      // Verify branch2 conversation still exists
      const remainingConvs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.projectId, projectId));
      expect(remainingConvs).toHaveLength(1);
      expect(remainingConvs[0].id).toBe(branch2ConvId);
    });
  });

  describe('cascadeDeleteByContextConfig', () => {
    it('should delete contextCache entries for a specific contextConfig on a branch', async () => {
      const contextConfigId = 'config-1';
      const contextConfig2Id = 'config-2';

      // Create conversation
      const convId = generateId();
      await db.insert(conversations).values({
        tenantId,
        projectId,
        id: convId,
        activeSubAgentId: subAgentId,
        ref: branch1Ref,
      });

      // Create cache entries for contextConfig1 on branch1
      await db.insert(contextCache).values({
        tenantId,
        projectId,
        id: generateId(),
        conversationId: convId,
        contextConfigId,
        contextVariableKey: 'key1',
        ref: branch1Ref,
        value: {},
      });

      // Create cache entries for contextConfig2 (should NOT be deleted)
      const cache2Id = generateId();
      await db.insert(contextCache).values({
        tenantId,
        projectId,
        id: cache2Id,
        conversationId: convId,
        contextConfigId: contextConfig2Id,
        contextVariableKey: 'key2',
        ref: branch1Ref,
        value: {},
      });

      // Delete contextConfig1
      const result = await cascadeDeleteByContextConfig(db)({
        scopes: { tenantId, projectId },
        contextConfigId,
        fullBranchName: branch1Ref.name,
      });

      expect(result.contextCacheDeleted).toBe(1);

      // Verify contextConfig2 cache still exists
      const remainingCache = await db
        .select()
        .from(contextCache)
        .where(eq(contextCache.projectId, projectId));
      expect(remainingCache).toHaveLength(1);
      expect(remainingCache[0].id).toBe(cache2Id);
    });

    it('should not delete cache entries on other branches', async () => {
      const contextConfigId = 'config-1';

      // Create conversations on both branches
      const conv1Id = generateId();
      const conv2Id = generateId();
      await db.insert(conversations).values([
        {
          tenantId,
          projectId,
          id: conv1Id,
          activeSubAgentId: subAgentId,
          ref: branch1Ref,
        },
        {
          tenantId,
          projectId,
          id: conv2Id,
          activeSubAgentId: subAgentId,
          ref: branch2Ref,
        },
      ]);

      // Create cache on branch1
      await db.insert(contextCache).values({
        tenantId,
        projectId,
        id: generateId(),
        conversationId: conv1Id,
        contextConfigId,
        contextVariableKey: 'key1',
        ref: branch1Ref,
        value: {},
      });

      // Create cache on branch2
      const branch2CacheId = generateId();
      await db.insert(contextCache).values({
        tenantId,
        projectId,
        id: branch2CacheId,
        conversationId: conv2Id,
        contextConfigId,
        contextVariableKey: 'key1',
        ref: branch2Ref,
        value: {},
      });

      // Delete contextConfig on branch1
      await cascadeDeleteByContextConfig(db)({
        scopes: { tenantId, projectId },
        contextConfigId,
        fullBranchName: branch1Ref.name,
      });

      // Verify branch2 cache still exists
      const remainingCache = await db
        .select()
        .from(contextCache)
        .where(eq(contextCache.projectId, projectId));
      expect(remainingCache).toHaveLength(1);
      expect(remainingCache[0].id).toBe(branch2CacheId);
    });
  });

  describe('cascadeDeleteByTool', () => {
    const installationId = 'test-installation';
    const repositoryId = 'test-repository';
    const toolId = 'test-tool';

    beforeEach(async () => {
      // Clean up GitHub-related tables
      await db.delete(workAppGitHubMcpToolRepositoryAccess);
      await db.delete(workAppGitHubMcpToolAccessMode);
      await db.delete(workAppGitHubProjectRepositoryAccess);
      await db.delete(workAppGitHubProjectAccessMode);
      await db.delete(workAppGitHubRepositories);
      await db.delete(workAppGitHubInstallations);

      // Create test installation
      await db.insert(workAppGitHubInstallations).values({
        id: installationId,
        tenantId,
        installationId: '12345',
        accountLogin: 'test-org',
        accountId: '67890',
        accountType: 'Organization',
        status: 'active',
      });

      // Create test repository
      await db.insert(workAppGitHubRepositories).values({
        id: repositoryId,
        installationDbId: installationId,
        repositoryId: '111',
        repositoryName: 'test-repo',
        repositoryFullName: 'test-org/test-repo',
        private: false,
      });
    });

    it('should delete all MCP tool GitHub access entries for a tool', async () => {
      // Create MCP tool access mode
      await db.insert(workAppGitHubMcpToolAccessMode).values({
        toolId,
        tenantId,
        projectId,
        mode: 'selected',
      });

      // Create MCP tool repository access entries
      await db.insert(workAppGitHubMcpToolRepositoryAccess).values({
        id: generateId(),
        toolId,
        tenantId,
        projectId,
        repositoryDbId: repositoryId,
      });

      // Delete tool
      const result = await cascadeDeleteByTool(db)({ toolId });

      expect(result.mcpToolRepositoryAccessDeleted).toBe(1);
      expect(result.mcpToolAccessModeDeleted).toBe(true);

      // Verify entries are deleted
      const remainingAccess = await db
        .select()
        .from(workAppGitHubMcpToolRepositoryAccess)
        .where(eq(workAppGitHubMcpToolRepositoryAccess.toolId, toolId));
      expect(remainingAccess).toHaveLength(0);

      const remainingMode = await db
        .select()
        .from(workAppGitHubMcpToolAccessMode)
        .where(eq(workAppGitHubMcpToolAccessMode.toolId, toolId));
      expect(remainingMode).toHaveLength(0);
    });

    it('should not delete entries for other tools', async () => {
      const tool1 = 'tool-1';
      const tool2 = 'tool-2';

      // Create entries for both tools
      await db.insert(workAppGitHubMcpToolAccessMode).values([
        { toolId: tool1, tenantId, projectId, mode: 'all' },
        { toolId: tool2, tenantId, projectId, mode: 'selected' },
      ]);

      await db.insert(workAppGitHubMcpToolRepositoryAccess).values([
        { id: generateId(), toolId: tool1, tenantId, projectId, repositoryDbId: repositoryId },
        { id: generateId(), toolId: tool2, tenantId, projectId, repositoryDbId: repositoryId },
      ]);

      // Delete tool1
      await cascadeDeleteByTool(db)({ toolId: tool1 });

      // Verify tool2 entries still exist
      const remainingAccess = await db.select().from(workAppGitHubMcpToolRepositoryAccess);
      expect(remainingAccess).toHaveLength(1);
      expect(remainingAccess[0].toolId).toBe(tool2);

      const remainingMode = await db.select().from(workAppGitHubMcpToolAccessMode);
      expect(remainingMode).toHaveLength(1);
      expect(remainingMode[0].toolId).toBe(tool2);
    });

    it('should handle tool with no GitHub access entries', async () => {
      const result = await cascadeDeleteByTool(db)({ toolId: 'non-existent-tool' });

      expect(result.mcpToolRepositoryAccessDeleted).toBe(0);
      expect(result.mcpToolAccessModeDeleted).toBe(false);
    });
  });

  describe('cascadeDeleteGitHubAccessByProject', () => {
    const installationId = 'test-installation';
    const repositoryId = 'test-repository';
    const toolId = 'test-tool';

    beforeEach(async () => {
      // Clean up GitHub-related tables
      await db.delete(workAppGitHubMcpToolRepositoryAccess);
      await db.delete(workAppGitHubMcpToolAccessMode);
      await db.delete(workAppGitHubProjectRepositoryAccess);
      await db.delete(workAppGitHubProjectAccessMode);
      await db.delete(workAppGitHubRepositories);
      await db.delete(workAppGitHubInstallations);

      // Create test installation
      await db.insert(workAppGitHubInstallations).values({
        id: installationId,
        tenantId,
        installationId: '12345',
        accountLogin: 'test-org',
        accountId: '67890',
        accountType: 'Organization',
        status: 'active',
      });

      // Create test repository
      await db.insert(workAppGitHubRepositories).values({
        id: repositoryId,
        installationDbId: installationId,
        repositoryId: '111',
        repositoryName: 'test-repo',
        repositoryFullName: 'test-org/test-repo',
        private: false,
      });
    });

    it('should delete all GitHub access entries for a project', async () => {
      // Create project access mode
      await db.insert(workAppGitHubProjectAccessMode).values({
        tenantId,
        projectId,
        mode: 'selected',
      });

      // Create project repository access
      await db.insert(workAppGitHubProjectRepositoryAccess).values({
        id: generateId(),
        tenantId,
        projectId,
        repositoryDbId: repositoryId,
      });

      // Create MCP tool access mode for a tool in this project
      await db.insert(workAppGitHubMcpToolAccessMode).values({
        toolId,
        tenantId,
        projectId,
        mode: 'selected',
      });

      // Create MCP tool repository access
      await db.insert(workAppGitHubMcpToolRepositoryAccess).values({
        id: generateId(),
        toolId,
        tenantId,
        projectId,
        repositoryDbId: repositoryId,
      });

      // Delete project GitHub access
      const result = await cascadeDeleteGitHubAccessByProject(db)({ tenantId, projectId });

      expect(result.projectRepositoryAccessDeleted).toBe(1);
      expect(result.projectAccessModeDeleted).toBe(true);
      expect(result.mcpToolRepositoryAccessDeleted).toBe(1);
      expect(result.mcpToolAccessModesDeleted).toBe(1);

      // Verify all entries are deleted
      const remainingProjectAccess = await db
        .select()
        .from(workAppGitHubProjectRepositoryAccess)
        .where(eq(workAppGitHubProjectRepositoryAccess.projectId, projectId));
      expect(remainingProjectAccess).toHaveLength(0);

      const remainingProjectMode = await db
        .select()
        .from(workAppGitHubProjectAccessMode)
        .where(eq(workAppGitHubProjectAccessMode.projectId, projectId));
      expect(remainingProjectMode).toHaveLength(0);

      const remainingToolAccess = await db
        .select()
        .from(workAppGitHubMcpToolRepositoryAccess)
        .where(eq(workAppGitHubMcpToolRepositoryAccess.projectId, projectId));
      expect(remainingToolAccess).toHaveLength(0);

      const remainingToolMode = await db
        .select()
        .from(workAppGitHubMcpToolAccessMode)
        .where(eq(workAppGitHubMcpToolAccessMode.projectId, projectId));
      expect(remainingToolMode).toHaveLength(0);
    });

    it('should not delete entries for other projects', async () => {
      const project1 = 'project-1';
      const project2 = 'project-2';

      // Create entries for both projects
      await db.insert(workAppGitHubProjectAccessMode).values([
        { tenantId, projectId: project1, mode: 'all' },
        { tenantId, projectId: project2, mode: 'selected' },
      ]);

      await db.insert(workAppGitHubProjectRepositoryAccess).values([
        { id: generateId(), tenantId, projectId: project1, repositoryDbId: repositoryId },
        { id: generateId(), tenantId, projectId: project2, repositoryDbId: repositoryId },
      ]);

      // Delete project1 GitHub access
      await cascadeDeleteGitHubAccessByProject(db)({ tenantId, projectId: project1 });

      // Verify project2 entries still exist
      const remainingProjectAccess = await db.select().from(workAppGitHubProjectRepositoryAccess);
      expect(remainingProjectAccess).toHaveLength(1);
      expect(remainingProjectAccess[0].projectId).toBe(project2);

      const remainingProjectMode = await db.select().from(workAppGitHubProjectAccessMode);
      expect(remainingProjectMode).toHaveLength(1);
      expect(remainingProjectMode[0].projectId).toBe(project2);
    });

    it('should handle project with no GitHub access entries', async () => {
      const result = await cascadeDeleteGitHubAccessByProject(db)({
        tenantId,
        projectId: 'non-existent-project',
      });

      expect(result.projectRepositoryAccessDeleted).toBe(0);
      expect(result.projectAccessModeDeleted).toBe(false);
      expect(result.mcpToolRepositoryAccessDeleted).toBe(0);
      expect(result.mcpToolAccessModesDeleted).toBe(0);
    });
  });
});
