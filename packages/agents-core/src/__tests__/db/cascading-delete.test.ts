import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  agentArtifactComponents,
  agentDataComponents,
  agentGraph,
  agentRelations,
  agents,
  agentToolRelations,
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
  taskRelations,
  tasks,
  tools,
} from '../../db/schema';
import { dbClient } from '../setup';

describe('Cascading Delete Tests', () => {
  const tenantId = 'test-tenant';
  const projectId = nanoid();

  beforeAll(async () => {
    // Enable foreign key constraints for cascading delete tests
    await dbClient.run(sql`PRAGMA foreign_keys = ON`);
  });

  beforeEach(async () => {
    // Clean up all tables
    await dbClient.delete(projects);
    await dbClient.delete(agents);
    await dbClient.delete(agentGraph);
    await dbClient.delete(contextConfigs);
    await dbClient.delete(contextCache);
    await dbClient.delete(conversations);
    await dbClient.delete(messages);
    await dbClient.delete(tasks);
    await dbClient.delete(taskRelations);
    await dbClient.delete(dataComponents);
    await dbClient.delete(agentDataComponents);
    await dbClient.delete(artifactComponents);
    await dbClient.delete(agentArtifactComponents);
    await dbClient.delete(tools);
    await dbClient.delete(agentToolRelations);
    await dbClient.delete(externalAgents);
    await dbClient.delete(apiKeys);
    await dbClient.delete(ledgerArtifacts);
    await dbClient.delete(credentialReferences);
    await dbClient.delete(agentRelations);
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

    // Create an agent graph first
    const graphId = nanoid();
    const agentId = nanoid();
    const graph = {
      tenantId,
      projectId,
      id: graphId,
      name: 'Test Graph',
      description: 'Test graph',
      defaultAgentId: agentId,
    };
    await dbClient.insert(agentGraph).values(graph);

    // Create an agent (now with graphId)
    const agent = {
      tenantId,
      projectId,
      graphId,
      id: agentId,
      name: 'Test Agent',
      description: 'Test agent',
      prompt: 'You are a test agent',
    };
    await dbClient.insert(agents).values(agent);

    // Create context config
    const contextConfig = {
      tenantId,
      projectId,
      graphId,
      id: nanoid(),
      name: 'Test Context Config',
      description: 'Test context configuration',
    };
    await dbClient.insert(contextConfigs).values(contextConfig);

    // Create context cache
    const contextCacheEntry = {
      tenantId,
      projectId,
      id: nanoid(),
      conversationId: nanoid(),
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
      id: nanoid(),
      activeAgentId: agentId,
    };
    await dbClient.insert(conversations).values(conversation);

    // Create message
    const message = {
      tenantId,
      projectId,
      id: nanoid(),
      conversationId: conversation.id,
      role: 'user',
      content: { type: 'text', text: 'Hello' },
    };
    await dbClient.insert(messages).values(message);

    // Create task
    const task = {
      tenantId,
      projectId,
      id: nanoid(),
      graphId: graphId,
      contextId: nanoid(),
      status: 'pending',
      agentId: agentId,
    };
    await dbClient.insert(tasks).values(task);

    // Create data component
    const dataComponent = {
      tenantId,
      projectId,
      id: nanoid(),
      name: 'Test Data Component',
      description: 'Test data component',
      props: {},
    };
    await dbClient.insert(dataComponents).values(dataComponent);

    // Create artifact component
    const artifactComponent = {
      tenantId,
      projectId,
      id: nanoid(),
      name: 'Test Artifact Component',
      description: 'Test artifact component',
      summaryProps: {},
      fullProps: {},
    };
    await dbClient.insert(artifactComponents).values(artifactComponent);

    // Create tool
    const tool = {
      tenantId,
      projectId,
      id: nanoid(),
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
      graphId,
      id: nanoid(),
      name: 'Test External Agent',
      description: 'Test external agent',
      baseUrl: 'https://example.com',
    };
    await dbClient.insert(externalAgents).values(externalAgent);

    // Create API key
    const apiKey = {
      id: nanoid(),
      tenantId,
      projectId,
      graphId: graphId,
      publicId: nanoid(),
      keyHash: 'test-hash',
      keyPrefix: 'sk_test_',
    };
    await dbClient.insert(apiKeys).values(apiKey);

    // Create ledger artifact
    const ledgerArtifact = {
      tenantId,
      projectId,
      id: nanoid(),
      taskId: nanoid(),
      contextId: nanoid(),
      type: 'source' as const,
    };
    await dbClient.insert(ledgerArtifacts).values(ledgerArtifact);

    // Create credential reference
    const credentialReference = {
      tenantId,
      projectId,
      id: nanoid(),
      type: 'memory',
      credentialStoreId: 'test-store',
    };
    await dbClient.insert(credentialReferences).values(credentialReference);

    // Create junction table entries
    const agentDataComponentRelation = {
      tenantId,
      projectId,
      graphId,
      id: nanoid(),
      agentId: agentId,
      dataComponentId: dataComponent.id,
    };
    await dbClient.insert(agentDataComponents).values(agentDataComponentRelation);

    const agentArtifactComponentRelation = {
      tenantId,
      projectId,
      graphId,
      id: nanoid(),
      agentId: agentId,
      artifactComponentId: artifactComponent.id,
    };
    await dbClient.insert(agentArtifactComponents).values(agentArtifactComponentRelation);

    const agentToolRelation = {
      tenantId,
      projectId,
      graphId,
      id: nanoid(),
      agentId: agentId,
      toolId: tool.id,
    };
    await dbClient.insert(agentToolRelations).values(agentToolRelation);

    const agentRelation = {
      tenantId,
      projectId,
      id: nanoid(),
      graphId: graphId,
      sourceAgentId: agentId,
      targetAgentId: agentId,
    };
    await dbClient.insert(agentRelations).values(agentRelation);

    // Verify all records exist before deletion
    const projectsCount = await dbClient.select().from(projects).where(eq(projects.id, projectId));
    expect(projectsCount).toHaveLength(1);

    const agentsCount = await dbClient.select().from(agents).where(eq(agents.projectId, projectId));
    expect(agentsCount).toHaveLength(1);

    // Delete the project
    await dbClient.delete(projects).where(eq(projects.id, projectId));

    // Verify all related records are deleted
    const remainingProjects = await dbClient
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(remainingProjects).toHaveLength(0);

    const remainingAgents = await dbClient
      .select()
      .from(agents)
      .where(eq(agents.projectId, projectId));
    expect(remainingAgents).toHaveLength(0);

    const remainingGraphs = await dbClient
      .select()
      .from(agentGraph)
      .where(eq(agentGraph.projectId, projectId));
    expect(remainingGraphs).toHaveLength(0);

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
      .from(agentDataComponents)
      .where(eq(agentDataComponents.projectId, projectId));
    expect(remainingAgentDataComponents).toHaveLength(0);

    const remainingAgentArtifactComponents = await dbClient
      .select()
      .from(agentArtifactComponents)
      .where(eq(agentArtifactComponents.projectId, projectId));
    expect(remainingAgentArtifactComponents).toHaveLength(0);

    const remainingAgentToolRelations = await dbClient
      .select()
      .from(agentToolRelations)
      .where(eq(agentToolRelations.projectId, projectId));
    expect(remainingAgentToolRelations).toHaveLength(0);

    const remainingAgentRelations = await dbClient
      .select()
      .from(agentRelations)
      .where(eq(agentRelations.projectId, projectId));
    expect(remainingAgentRelations).toHaveLength(0);
  });

  it('should not affect other projects when deleting one project', async () => {
    const project1Id = nanoid();
    const project2Id = nanoid();

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

    // Create graphs for both projects
    const graph1Id = nanoid();
    const graph2Id = nanoid();
    const agent1Id = nanoid();
    const agent2Id = nanoid();

    await dbClient.insert(agentGraph).values([
      {
        tenantId,
        projectId: project1Id,
        id: graph1Id,
        name: 'Graph 1',
        description: 'Graph for project 1',
        defaultAgentId: agent1Id,
      },
      {
        tenantId,
        projectId: project2Id,
        id: graph2Id,
        name: 'Graph 2',
        description: 'Graph for project 2',
        defaultAgentId: agent2Id,
      },
    ]);

    // Create agents for both projects (now with graphId)
    const agent1 = {
      tenantId,
      projectId: project1Id,
      graphId: graph1Id,
      id: agent1Id,
      name: 'Agent 1',
      description: 'Agent for project 1',
      prompt: 'You are agent 1',
    };
    const agent2 = {
      tenantId,
      projectId: project2Id,
      graphId: graph2Id,
      id: agent2Id,
      name: 'Agent 2',
      description: 'Agent for project 2',
      prompt: 'You are agent 2',
    };
    await dbClient.insert(agents).values([agent1, agent2]);

    // Delete project 1
    await dbClient.delete(projects).where(eq(projects.id, project1Id));

    // Verify project 1 and its agent are gone
    const remainingProject1 = await dbClient
      .select()
      .from(projects)
      .where(eq(projects.id, project1Id));
    expect(remainingProject1).toHaveLength(0);

    const remainingAgent1 = await dbClient.select().from(agents).where(eq(agents.id, agent1.id));
    expect(remainingAgent1).toHaveLength(0);

    // Verify project 2 and its agent still exist
    const remainingProject2 = await dbClient
      .select()
      .from(projects)
      .where(eq(projects.id, project2Id));
    expect(remainingProject2).toHaveLength(1);

    const remainingAgent2 = await dbClient.select().from(agents).where(eq(agents.id, agent2.id));
    expect(remainingAgent2).toHaveLength(1);
  });
});
