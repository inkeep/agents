import type {
  ApiKeyInsert,
  ExternalAgentInsert,
  SubAgentDataComponentInsert,
  TaskInsert,
} from '@inkeep/agents-core';
import { eq, sql } from 'drizzle-orm';
import { generateId } from '../../utils/conversations';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  agents,
  apiKeys,
  artifactComponents,
  contextCache,
  contextConfigs,
  conversations,
  credentialReferences,
  dataComponents,
  externalAgents,
  ledgerArtifacts,
  messages,
  projects,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentRelations,
  subAgents,
  subAgentToolRelations,
  taskRelations,
  tasks,
  tools,
} from '../../db/schema';
import { dbClient } from '../setup';

describe('Cascading Delete Tests', () => {
  const tenantId = 'test-tenant';
  const projectId = generateId();

  beforeAll(async () => {
    // Enable foreign key constraints for cascading delete tests
    await dbClient.run(sql`PRAGMA foreign_keys = ON`);
  });

  beforeEach(async () => {
    // Clean up all tables
    await dbClient.delete(projects);
    await dbClient.delete(subAgents);
    await dbClient.delete(agents);
    await dbClient.delete(contextConfigs);
    await dbClient.delete(contextCache);
    await dbClient.delete(conversations);
    await dbClient.delete(messages);
    await dbClient.delete(tasks);
    await dbClient.delete(taskRelations);
    await dbClient.delete(dataComponents);
    await dbClient.delete(subAgentDataComponents);
    await dbClient.delete(artifactComponents);
    await dbClient.delete(subAgentArtifactComponents);
    await dbClient.delete(tools);
    await dbClient.delete(subAgentToolRelations);
    await dbClient.delete(externalAgents);
    await dbClient.delete(apiKeys);
    await dbClient.delete(ledgerArtifacts);
    await dbClient.delete(credentialReferences);
    await dbClient.delete(subAgentRelations);
  });

  it('should cascade delete all project-related resources when project is deleted', async () => {
    // Create a project
    const project = {
      tenantId,
      id: projectId,
      name: 'Test Project',
      description: 'Test project for cascading delete',
    };
    await dbClient.insert(projects).values(project);

    // Create an agent first
    const agentId = generateId();
    const subAgentId = generateId();
    const agent = {
      tenantId,
      projectId,
      id: agentId,
      name: 'Test Agent',
      description: 'Test agent',
      defaultSubAgentId: subAgentId,
    };
    await dbClient.insert(agents).values(agent);

    // Create a subagent (now with agentId)
    const subAgent = {
      tenantId,
      projectId,
      agentId,
      id: subAgentId,
      name: 'Test Agent',
      description: 'Test agent',
      prompt: 'You are a test agent',
    };
    await dbClient.insert(subAgents).values(subAgent);

    // Create context config
    const contextConfig = {
      tenantId,
      projectId,
      agentId,
      id: generateId(),
      name: 'Test Context Config',
      description: 'Test context configuration',
    };
    await dbClient.insert(contextConfigs).values(contextConfig);

    // Create context cache
    const contextCacheEntry = {
      tenantId,
      projectId,
      id: generateId(),
      conversationId: generateId(),
      contextConfigId: contextConfig.id,
      contextVariableKey: 'test-key',
      value: { test: 'data' },
      fetchedAt: new Date().toISOString(),
    };
    await dbClient.insert(contextCache).values(contextCacheEntry);

    // Create conversation
    const conversation = {
      tenantId,
      projectId,
      id: generateId(),
      activeSubAgentId: subAgentId,
    };
    await dbClient.insert(conversations).values(conversation);

    // Create message
    const message = {
      tenantId,
      projectId,
      id: generateId(),
      conversationId: conversation.id,
      role: 'user',
      content: { type: 'text', text: 'Hello' },
    };
    await dbClient.insert(messages).values(message);

    // Create task
    const task: TaskInsert = {
      tenantId,
      projectId,
      id: generateId(),
      agentId: agentId,
      contextId: generateId(),
      status: 'pending',
      subAgentId: subAgentId,
    };
    await dbClient.insert(tasks).values(task);

    // Create data component
    const dataComponent = {
      tenantId,
      projectId,
      id: generateId(),
      name: 'Test Data Component',
      description: 'Test data component',
      props: {},
    };
    await dbClient.insert(dataComponents).values(dataComponent);

    // Create artifact component
    const artifactComponent = {
      tenantId,
      projectId,
      id: generateId(),
      name: 'Test Artifact Component',
      description: 'Test artifact component',
      props: {},
    };
    await dbClient.insert(artifactComponents).values(artifactComponent);

    // Create tool
    const tool = {
      tenantId,
      projectId,
      id: generateId(),
      name: 'Test Tool',
      config: {
        type: 'mcp' as const,
        mcp: {
          server: {
            url: 'https://example.com',
          },
          transport: {
            type: 'streamable_http' as const,
          },
        },
      },
    };
    await dbClient.insert(tools).values(tool);

    // Create external agent
    const externalAgent = {
      tenantId,
      projectId,
      agentId,
      id: generateId(),
      name: 'Test External Agent',
      description: 'Test external agent',
      baseUrl: 'https://example.com',
    } satisfies ExternalAgentInsert;
    await dbClient.insert(externalAgents).values(externalAgent);

    // Create API key
    const apiKey = {
      id: generateId(),
      tenantId,
      projectId,
      agentId,
      publicId: generateId(),
      keyHash: 'test-hash',
      keyPrefix: 'sk_test_',
    } satisfies ApiKeyInsert;
    await dbClient.insert(apiKeys).values(apiKey);

    // Create ledger artifact
    const ledgerArtifact = {
      tenantId,
      projectId,
      id: generateId(),
      taskId: generateId(),
      contextId: generateId(),
      type: 'source' as const,
    };
    await dbClient.insert(ledgerArtifacts).values(ledgerArtifact);

    // Create credential reference
    const credentialReference = {
      tenantId,
      projectId,
      id: generateId(),
      type: 'memory',
      credentialStoreId: 'test-store',
    };
    await dbClient.insert(credentialReferences).values(credentialReference);

    // Create junction table entries
    const agentDataComponentRelation: SubAgentDataComponentInsert = {
      tenantId,
      projectId,
      agentId,
      id: generateId(),
      subAgentId: subAgentId,
      dataComponentId: dataComponent.id,
    };
    await dbClient.insert(subAgentDataComponents).values(agentDataComponentRelation);

    const agentArtifactComponentRelation = {
      tenantId,
      projectId,
      agentId,
      id: generateId(),
      subAgentId: subAgentId,
      artifactComponentId: artifactComponent.id,
    };
    await dbClient.insert(subAgentArtifactComponents).values(agentArtifactComponentRelation);

    const agentToolRelation = {
      tenantId,
      projectId,
      agentId,
      id: generateId(),
      subAgentId: subAgentId,
      toolId: tool.id,
    };
    await dbClient.insert(subAgentToolRelations).values(agentToolRelation);

    const agentRelation = {
      tenantId,
      projectId,
      id: generateId(),
      agentId,
      sourceSubAgentId: subAgentId,
      targetSubAgentId: subAgentId,
    };
    await dbClient.insert(subAgentRelations).values(agentRelation);

    // Verify all records exist before deletion
    const projectsCount = await dbClient.select().from(projects).where(eq(projects.id, projectId));
    expect(projectsCount).toHaveLength(1);

    const agentsCount = await dbClient
      .select()
      .from(subAgents)
      .where(eq(subAgents.projectId, projectId));
    expect(agentsCount).toHaveLength(1);

    // Delete the project
    await dbClient.delete(projects).where(eq(projects.id, projectId));

    // Verify all related records are deleted
    const remainingProjects = await dbClient
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(remainingProjects).toHaveLength(0);

    const remainingSubAgents = await dbClient
      .select()
      .from(subAgents)
      .where(eq(subAgents.projectId, projectId));
    expect(remainingSubAgents).toHaveLength(0);

    const remainingAgents = await dbClient
      .select()
      .from(agents)
      .where(eq(agents.projectId, projectId));
    expect(remainingAgents).toHaveLength(0);

    const remainingContextConfigs = await dbClient
      .select()
      .from(contextConfigs)
      .where(eq(contextConfigs.projectId, projectId));
    expect(remainingContextConfigs).toHaveLength(0);

    const remainingContextCache = await dbClient
      .select()
      .from(contextCache)
      .where(eq(contextCache.projectId, projectId));
    expect(remainingContextCache).toHaveLength(0);

    const remainingConversations = await dbClient
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId));
    expect(remainingConversations).toHaveLength(0);

    const remainingMessages = await dbClient
      .select()
      .from(messages)
      .where(eq(messages.projectId, projectId));
    expect(remainingMessages).toHaveLength(0);

    const remainingTasks = await dbClient
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));
    expect(remainingTasks).toHaveLength(0);

    const remainingDataComponents = await dbClient
      .select()
      .from(dataComponents)
      .where(eq(dataComponents.projectId, projectId));
    expect(remainingDataComponents).toHaveLength(0);

    const remainingArtifactComponents = await dbClient
      .select()
      .from(artifactComponents)
      .where(eq(artifactComponents.projectId, projectId));
    expect(remainingArtifactComponents).toHaveLength(0);

    const remainingTools = await dbClient
      .select()
      .from(tools)
      .where(eq(tools.projectId, projectId));
    expect(remainingTools).toHaveLength(0);

    const remainingExternalAgents = await dbClient
      .select()
      .from(externalAgents)
      .where(eq(externalAgents.projectId, projectId));
    expect(remainingExternalAgents).toHaveLength(0);

    const remainingApiKeys = await dbClient
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.projectId, projectId));
    expect(remainingApiKeys).toHaveLength(0);

    const remainingLedgerArtifacts = await dbClient
      .select()
      .from(ledgerArtifacts)
      .where(eq(ledgerArtifacts.projectId, projectId));
    expect(remainingLedgerArtifacts).toHaveLength(0);

    const remainingCredentialReferences = await dbClient
      .select()
      .from(credentialReferences)
      .where(eq(credentialReferences.projectId, projectId));
    expect(remainingCredentialReferences).toHaveLength(0);

    // Junction tables should also be cleaned up
    const remainingAgentDataComponents = await dbClient
      .select()
      .from(subAgentDataComponents)
      .where(eq(subAgentDataComponents.projectId, projectId));
    expect(remainingAgentDataComponents).toHaveLength(0);

    const remainingAgentArtifactComponents = await dbClient
      .select()
      .from(subAgentArtifactComponents)
      .where(eq(subAgentArtifactComponents.projectId, projectId));
    expect(remainingAgentArtifactComponents).toHaveLength(0);

    const remainingAgentToolRelations = await dbClient
      .select()
      .from(subAgentToolRelations)
      .where(eq(subAgentToolRelations.projectId, projectId));
    expect(remainingAgentToolRelations).toHaveLength(0);

    const remainingAgentRelations = await dbClient
      .select()
      .from(subAgentRelations)
      .where(eq(subAgentRelations.projectId, projectId));
    expect(remainingAgentRelations).toHaveLength(0);
  });

  it('should not affect other projects when deleting one project', async () => {
    const project1Id = generateId();
    const project2Id = generateId();

    // Create two projects
    await dbClient.insert(projects).values([
      {
        tenantId,
        id: project1Id,
        name: 'Project 1',
        description: 'First project',
      },
      {
        tenantId,
        id: project2Id,
        name: 'Project 2',
        description: 'Second project',
      },
    ]);

    // Create agents for both projects
    const agent1Id = generateId();
    const agent2Id = generateId();
    const subAgent1Id = generateId();
    const subAgent2Id = generateId();

    await dbClient.insert(agents).values([
      {
        tenantId,
        projectId: project1Id,
        id: agent1Id,
        name: 'Agent 1',
        description: 'Agent for project 1',
        defaultSubAgentId: subAgent1Id,
      },
      {
        tenantId,
        projectId: project2Id,
        id: agent2Id,
        name: 'Agent 2',
        description: 'Agent for project 2',
        defaultSubAgentId: subAgent2Id,
      },
    ]);

    const agent1 = {
      tenantId,
      projectId: project1Id,
      agentId: agent1Id,
      id: subAgent1Id,
      name: 'Agent 1',
      description: 'Agent for project 1',
      prompt: 'You are agent 1',
    };
    const agent2 = {
      tenantId,
      projectId: project2Id,
      agentId: agent2Id,
      id: subAgent2Id,
      name: 'Agent 2',
      description: 'Agent for project 2',
      prompt: 'You are agent 2',
    };
    await dbClient.insert(subAgents).values([agent1, agent2]);

    // Delete project 1
    await dbClient.delete(projects).where(eq(projects.id, project1Id));

    // Verify project 1 and its agent are gone
    const remainingProject1 = await dbClient
      .select()
      .from(projects)
      .where(eq(projects.id, project1Id));
    expect(remainingProject1).toHaveLength(0);

    const remainingAgent1 = await dbClient
      .select()
      .from(subAgents)
      .where(eq(subAgents.id, agent1.id));
    expect(remainingAgent1).toHaveLength(0);

    // Verify project 2 and its agent still exist
    const remainingProject2 = await dbClient
      .select()
      .from(projects)
      .where(eq(projects.id, project2Id));
    expect(remainingProject2).toHaveLength(1);

    const remainingAgent2 = await dbClient
      .select()
      .from(subAgents)
      .where(eq(subAgents.id, agent2.id));
    expect(remainingAgent2).toHaveLength(1);
  });
});
