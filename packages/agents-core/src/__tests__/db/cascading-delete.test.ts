import type {
  ExternalAgentInsert,
  JsonSchemaForLlmSchemaType,
  SubAgentDataComponentInsert,
} from '@inkeep/agents-core';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  agents,
  artifactComponents,
  contextConfigs,
  credentialReferences,
  dataComponents,
  externalAgents,
  projects,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentRelations,
  subAgents,
  subAgentToolRelations,
  tools,
} from '../../db/manage/manage-schema';
import { createTestProject } from '../../db/manage/test-manage-client';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  contextCache,
  conversations,
  ledgerArtifacts,
  messages,
  taskRelations,
  tasks,
} from '../../db/runtime/runtime-schema';
import { generateId } from '../../utils/conversations';
import type { ResolvedRef } from '../../validation/dolt-schemas';
import { testManageDbClient, testRunDbClient } from '../setup';

describe('Cascading Delete Tests (Manage DB)', () => {
  let dbClient: AgentsManageDatabaseClient;
  const tenantId = 'test-tenant';
  const projectId = generateId();

  beforeAll(async () => {
    dbClient = testManageDbClient;
  });

  beforeEach(async () => {
    // Clean up all manage DB tables
    await dbClient.delete(subAgentRelations);
    await dbClient.delete(subAgentToolRelations);
    await dbClient.delete(subAgentArtifactComponents);
    await dbClient.delete(subAgentDataComponents);
    await dbClient.delete(credentialReferences);
    await dbClient.delete(externalAgents);
    await dbClient.delete(tools);
    await dbClient.delete(artifactComponents);
    await dbClient.delete(dataComponents);
    await dbClient.delete(contextConfigs);
    await dbClient.delete(subAgents);
    await dbClient.delete(agents);
    await dbClient.delete(projects);
  });

  it('should cascade delete all project-related config resources when project is deleted', async () => {
    // Create a project (with organization)
    await createTestProject(dbClient, tenantId, projectId);

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

    // Create data component
    const dataComponent = {
      tenantId,
      projectId,
      id: generateId(),
      name: 'Test Data Component',
      description: 'Test data component',
      props: {} as JsonSchemaForLlmSchemaType,
    };
    await dbClient.insert(dataComponents).values(dataComponent);

    // Create artifact component
    const artifactComponent = {
      tenantId,
      projectId,
      id: generateId(),
      name: 'Test Artifact Component',
      description: 'Test artifact component',
      props: {} as JsonSchemaForLlmSchemaType,
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
      id: generateId(),
      name: 'Test External Agent',
      description: 'Test external agent',
      baseUrl: 'https://example.com',
    } satisfies ExternalAgentInsert;
    await dbClient.insert(externalAgents).values(externalAgent);

    // Create credential reference
    const credentialReference = {
      tenantId,
      projectId,
      id: generateId(),
      name: 'Test Credential',
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

    // Verify all related config records are deleted
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

    // Create two projects (with organization)
    await createTestProject(dbClient, tenantId, project1Id);
    await createTestProject(dbClient, tenantId, project2Id);

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

describe('Cascading Delete Tests (Runtime DB)', () => {
  let dbClient: AgentsRunDatabaseClient;
  const tenantId = 'test-tenant';
  const projectId = 'test-project';
  const agentId = 'test-agent';
  const subAgentId = 'test-sub-agent';
  const testRef: ResolvedRef = { type: 'branch', name: 'main', hash: 'abc123' };

  beforeAll(async () => {
    dbClient = testRunDbClient;
  });

  describe('Conversation cascade deletes', () => {
    it('should cascade delete messages when conversation is deleted', async () => {
      const conversationId = generateId();
      const messageId1 = generateId();
      const messageId2 = generateId();

      // Create a conversation
      await dbClient.insert(conversations).values({
        tenantId,
        projectId,
        id: conversationId,
        activeSubAgentId: subAgentId,
        ref: testRef,
      });

      // Create messages for the conversation
      await dbClient.insert(messages).values([
        {
          tenantId,
          projectId,
          id: messageId1,
          conversationId,
          role: 'user',
          content: { text: 'Hello' },
        },
        {
          tenantId,
          projectId,
          id: messageId2,
          conversationId,
          role: 'assistant',
          content: { text: 'Hi there!' },
        },
      ]);

      // Verify messages exist
      const messagesBefore = await dbClient
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      expect(messagesBefore).toHaveLength(2);

      // Delete the conversation
      await dbClient.delete(conversations).where(eq(conversations.id, conversationId));

      // Verify messages are cascade deleted
      const messagesAfter = await dbClient
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      expect(messagesAfter).toHaveLength(0);
    });

    it('should cascade delete contextCache when conversation is deleted', async () => {
      const conversationId = generateId();
      const cacheId = generateId();

      // Create a conversation
      await dbClient.insert(conversations).values({
        tenantId,
        projectId,
        id: conversationId,
        activeSubAgentId: subAgentId,
        ref: testRef,
      });

      // Create context cache entry
      await dbClient.insert(contextCache).values({
        tenantId,
        projectId,
        id: cacheId,
        conversationId,
        contextConfigId: 'test-context-config',
        contextVariableKey: 'testKey',
        ref: testRef,
        value: { cached: 'data' },
      });

      // Verify cache exists
      const cacheBefore = await dbClient
        .select()
        .from(contextCache)
        .where(eq(contextCache.conversationId, conversationId));
      expect(cacheBefore).toHaveLength(1);

      // Delete the conversation
      await dbClient.delete(conversations).where(eq(conversations.id, conversationId));

      // Verify cache is cascade deleted
      const cacheAfter = await dbClient
        .select()
        .from(contextCache)
        .where(eq(contextCache.conversationId, conversationId));
      expect(cacheAfter).toHaveLength(0);
    });
  });

  describe('Task cascade deletes', () => {
    it('should cascade delete ledgerArtifacts when task is deleted', async () => {
      const conversationId = generateId();
      const taskId = generateId();
      const artifactId1 = generateId();
      const artifactId2 = generateId();

      await dbClient.insert(conversations).values({
        tenantId,
        projectId,
        id: conversationId,
        activeSubAgentId: subAgentId,
        ref: testRef,
      });

      // Create a task
      await dbClient.insert(tasks).values({
        tenantId,
        projectId,
        id: taskId,
        agentId,
        subAgentId,
        contextId: conversationId,
        ref: testRef,
        status: 'pending',
      });

      // Create ledger artifacts for the task
      await dbClient.insert(ledgerArtifacts).values([
        {
          tenantId,
          projectId,
          id: artifactId1,
          taskId,
          contextId: conversationId,
          type: 'source',
          name: 'artifact1',
        },
        {
          tenantId,
          projectId,
          id: artifactId2,
          taskId,
          contextId: conversationId,
          type: 'result',
          name: 'artifact2',
        },
      ]);

      // Verify artifacts exist
      const artifactsBefore = await dbClient
        .select()
        .from(ledgerArtifacts)
        .where(eq(ledgerArtifacts.taskId, taskId));
      expect(artifactsBefore).toHaveLength(2);

      // Delete the task
      await dbClient.delete(tasks).where(eq(tasks.id, taskId));

      // Verify artifacts are not deleted by task deletion (they are conversation-scoped)
      const artifactsAfter = await dbClient
        .select()
        .from(ledgerArtifacts)
        .where(eq(ledgerArtifacts.taskId, taskId));
      expect(artifactsAfter).toHaveLength(2);

      await dbClient.delete(conversations).where(eq(conversations.id, conversationId));

      const artifactsAfterConversationDelete = await dbClient
        .select()
        .from(ledgerArtifacts)
        .where(eq(ledgerArtifacts.taskId, taskId));
      expect(artifactsAfterConversationDelete).toHaveLength(0);
    });

    it('should cascade delete taskRelations when parent task is deleted', async () => {
      const parentTaskId = generateId();
      const childTaskId = generateId();
      const relationId = generateId();

      // Create parent and child tasks
      await dbClient.insert(tasks).values([
        {
          tenantId,
          projectId,
          id: parentTaskId,
          agentId,
          subAgentId,
          contextId: 'test-context',
          ref: testRef,
          status: 'pending',
        },
        {
          tenantId,
          projectId,
          id: childTaskId,
          agentId,
          subAgentId,
          contextId: 'test-context',
          ref: testRef,
          status: 'pending',
        },
      ]);

      // Create task relation
      await dbClient.insert(taskRelations).values({
        tenantId,
        projectId,
        id: relationId,
        parentTaskId,
        childTaskId,
      });

      // Verify relation exists
      const relationsBefore = await dbClient
        .select()
        .from(taskRelations)
        .where(eq(taskRelations.id, relationId));
      expect(relationsBefore).toHaveLength(1);

      // Delete the parent task
      await dbClient.delete(tasks).where(eq(tasks.id, parentTaskId));

      // Verify relation is cascade deleted
      const relationsAfter = await dbClient
        .select()
        .from(taskRelations)
        .where(eq(taskRelations.id, relationId));
      expect(relationsAfter).toHaveLength(0);

      // Child task should still exist
      const childTaskAfter = await dbClient.select().from(tasks).where(eq(tasks.id, childTaskId));
      expect(childTaskAfter).toHaveLength(1);
    });

    it('should cascade delete taskRelations when child task is deleted', async () => {
      const parentTaskId = generateId();
      const childTaskId = generateId();
      const relationId = generateId();

      // Create parent and child tasks
      await dbClient.insert(tasks).values([
        {
          tenantId,
          projectId,
          id: parentTaskId,
          agentId,
          subAgentId,
          contextId: 'test-context',
          ref: testRef,
          status: 'pending',
        },
        {
          tenantId,
          projectId,
          id: childTaskId,
          agentId,
          subAgentId,
          contextId: 'test-context',
          ref: testRef,
          status: 'pending',
        },
      ]);

      // Create task relation
      await dbClient.insert(taskRelations).values({
        tenantId,
        projectId,
        id: relationId,
        parentTaskId,
        childTaskId,
      });

      // Verify relation exists
      const relationsBefore = await dbClient
        .select()
        .from(taskRelations)
        .where(eq(taskRelations.id, relationId));
      expect(relationsBefore).toHaveLength(1);

      // Delete the child task
      await dbClient.delete(tasks).where(eq(tasks.id, childTaskId));

      // Verify relation is cascade deleted
      const relationsAfter = await dbClient
        .select()
        .from(taskRelations)
        .where(eq(taskRelations.id, relationId));
      expect(relationsAfter).toHaveLength(0);

      // Parent task should still exist
      const parentTaskAfter = await dbClient.select().from(tasks).where(eq(tasks.id, parentTaskId));
      expect(parentTaskAfter).toHaveLength(1);
    });

    // NOTE: messages.taskId and messages.parentMessageId do NOT have FK constraints
    // with SET NULL because PostgreSQL composite FKs try to NULL all columns
    // (including tenantId/projectId which are NOT NULL).
    // These optional references must be handled in application code.
  });

  describe('Cross-entity cascade isolation', () => {
    it('should not affect other conversations when deleting one', async () => {
      const conv1Id = generateId();
      const conv2Id = generateId();
      const msg1Id = generateId();
      const msg2Id = generateId();

      // Create two conversations
      await dbClient.insert(conversations).values([
        {
          tenantId,
          projectId,
          id: conv1Id,
          activeSubAgentId: subAgentId,
          ref: testRef,
        },
        {
          tenantId,
          projectId,
          id: conv2Id,
          activeSubAgentId: subAgentId,
          ref: testRef,
        },
      ]);

      // Create messages for each conversation
      await dbClient.insert(messages).values([
        {
          tenantId,
          projectId,
          id: msg1Id,
          conversationId: conv1Id,
          role: 'user',
          content: { text: 'Message in conv1' },
        },
        {
          tenantId,
          projectId,
          id: msg2Id,
          conversationId: conv2Id,
          role: 'user',
          content: { text: 'Message in conv2' },
        },
      ]);

      // Delete conversation 1
      await dbClient.delete(conversations).where(eq(conversations.id, conv1Id));

      // Verify conv1 and its message are gone
      const conv1After = await dbClient
        .select()
        .from(conversations)
        .where(eq(conversations.id, conv1Id));
      expect(conv1After).toHaveLength(0);

      const msg1After = await dbClient.select().from(messages).where(eq(messages.id, msg1Id));
      expect(msg1After).toHaveLength(0);

      // Verify conv2 and its message still exist
      const conv2After = await dbClient
        .select()
        .from(conversations)
        .where(eq(conversations.id, conv2Id));
      expect(conv2After).toHaveLength(1);

      const msg2After = await dbClient.select().from(messages).where(eq(messages.id, msg2Id));
      expect(msg2After).toHaveLength(1);
    });

    it('should handle complex cascade with conversation, messages, and tasks', async () => {
      const conversationId = generateId();
      const taskId = generateId();
      const messageId = generateId();
      const artifactId = generateId();
      const cacheId = generateId();

      // Create conversation
      await dbClient.insert(conversations).values({
        tenantId,
        projectId,
        id: conversationId,
        activeSubAgentId: subAgentId,
        ref: testRef,
      });

      // Create task
      await dbClient.insert(tasks).values({
        tenantId,
        projectId,
        id: taskId,
        agentId,
        subAgentId,
        contextId: conversationId,
        ref: testRef,
        status: 'pending',
      });

      // Create message referencing task
      await dbClient.insert(messages).values({
        tenantId,
        projectId,
        id: messageId,
        conversationId,
        role: 'assistant',
        content: { text: 'Task result' },
        taskId,
      });

      // Create ledger artifact
      await dbClient.insert(ledgerArtifacts).values({
        tenantId,
        projectId,
        id: artifactId,
        taskId,
        contextId: conversationId,
        type: 'source',
      });

      // Create context cache
      await dbClient.insert(contextCache).values({
        tenantId,
        projectId,
        id: cacheId,
        conversationId,
        contextConfigId: 'test-config',
        contextVariableKey: 'key',
        ref: testRef,
        value: {},
      });

      // Delete conversation - should cascade to messages and contextCache
      await dbClient.delete(conversations).where(eq(conversations.id, conversationId));

      // Verify conversation, messages, and cache are deleted
      const convAfter = await dbClient
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      expect(convAfter).toHaveLength(0);

      const messagesAfter = await dbClient
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      expect(messagesAfter).toHaveLength(0);

      const cacheAfter = await dbClient
        .select()
        .from(contextCache)
        .where(eq(contextCache.conversationId, conversationId));
      expect(cacheAfter).toHaveLength(0);

      // Task should still exist (not cascaded from conversation)
      const taskAfter = await dbClient.select().from(tasks).where(eq(tasks.id, taskId));
      expect(taskAfter).toHaveLength(1);

      const artifactsAfter = await dbClient
        .select()
        .from(ledgerArtifacts)
        .where(eq(ledgerArtifacts.taskId, taskId));
      expect(artifactsAfter).toHaveLength(0);

      // Now delete task
      await dbClient.delete(tasks).where(eq(tasks.id, taskId));

      const taskAfterDelete = await dbClient.select().from(tasks).where(eq(tasks.id, taskId));
      expect(taskAfterDelete).toHaveLength(0);

      const artifactsAfterDelete = await dbClient
        .select()
        .from(ledgerArtifacts)
        .where(eq(ledgerArtifacts.taskId, taskId));
      expect(artifactsAfterDelete).toHaveLength(0);
    });
  });
});
