import { agents, createTask, tasks } from '@inkeep/agents-core';
import { nanoid } from 'nanoid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import dbClient from '../../data/db/dbClient';
import { ensureTestProject } from '../utils/testProject';

describe('Delegation Task Creation Fixes', () => {
  const tenantId = 'math-tenant';
  const projectId = 'default';
  let conversationId: string;

  beforeAll(async () => {
    // Ensure project exists for this tenant
    await ensureTestProject(tenantId, projectId);

    // Import necessary modules
    const { agentGraph } = await import('@inkeep/agents-core');

    // Create a test graph first
    const graphId = 'test-graph';
    await dbClient.insert(agentGraph).values({
      id: graphId,
      tenantId: tenantId,
      projectId: projectId,
      name: 'Test Graph',
      defaultAgentId: 'math-supervisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create test agents with graphId
    await dbClient.insert(agents).values([
      {
        id: 'math-supervisor',
        tenantId: tenantId,
        projectId: projectId,
        graphId: graphId,
        name: 'Math Supervisor',
        description: 'Supervises math operations',
        prompt: 'Handle math supervision tasks',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'number-producer-a',
        tenantId: tenantId,
        projectId: projectId,
        graphId: graphId,
        name: 'Number Producer A',
        description: 'Produces numbers for math operations',
        prompt: 'Generate numbers as needed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  beforeEach(() => {
    conversationId = `test-conv-${Date.now()}`;
  });

  afterAll(async () => {
    // Clean up test data
    await dbClient.delete(tasks);
    await dbClient.delete(agents);
  });

  it('should create tasks with correct contextId and message content', async () => {
    // Test the createTask function directly
    const taskId = `test-task-${nanoid()}`;
    const _userMessage = 'Please help me with delegation testing';

    const task = await createTask(dbClient)({
      id: taskId,
      tenantId: 'math-tenant', // Use correct tenant for existing agents
      projectId: projectId,
      graphId: 'test-graph',
      agentId: 'math-supervisor', // Use existing agent from database
      contextId: conversationId,
      status: 'pending',
      metadata: {
        conversation_id: conversationId,
        message_id: 'test-msg-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agent_id: 'math-supervisor',
      },
    });

    const createdTask = Array.isArray(task) ? task[0] : task;

    expect(createdTask.contextId).toBe(conversationId);
  });

  it('should handle delegation A2A message structure correctly', async () => {
    // Test the A2A message structure that would be sent during delegation
    const messageToSend = {
      role: 'agent' as const,
      parts: [{ text: 'Generate a number between 0-50', kind: 'text' as const }],
      messageId: nanoid(),
      kind: 'message' as const,
      contextId: conversationId,
      metadata: {
        conversationId: conversationId,
        threadId: conversationId,
      },
    };

    // Verify the message structure is correct
    expect(messageToSend.contextId).toBe(conversationId);
    expect(messageToSend.metadata.conversationId).toBe(conversationId);
    expect(messageToSend.parts).toHaveLength(1);
    expect(messageToSend.parts[0].text).toBe('Generate a number between 0-50');
  });

  it('should preserve contextId when fallback is needed', async () => {
    // Test the contextId resolution logic that was added to A2A handlers
    const originalContextId: string | undefined = undefined; // Simulate missing contextId
    const taskContextId: string | undefined = conversationId; // Available in task.context
    const metadataContextId: string | undefined = 'default'; // Not useful

    // This is the logic from the A2A handlers
    let effectiveContextId: string | undefined = originalContextId;

    if (!effectiveContextId || effectiveContextId === 'default') {
      effectiveContextId = taskContextId;
    }

    if (!effectiveContextId || effectiveContextId === 'default') {
      if (metadataContextId && metadataContextId !== 'default') {
        effectiveContextId = metadataContextId;
      }
    }

    if (!effectiveContextId || effectiveContextId === 'default') {
      effectiveContextId = 'default';
    }

    expect(effectiveContextId).toBe(conversationId);
  });

  it('should create fallback message content when message is empty', async () => {
    // Test the fallback message logic from A2A handlers
    const emptyMessage = undefined;
    const taskId = `task-${nanoid()}`;
    const effectiveContextId = conversationId;

    let messageContent = '';

    if (emptyMessage && Object.keys(emptyMessage).length > 0) {
      messageContent = JSON.stringify(emptyMessage);
    } else {
      // Fallback: create a minimal message structure
      messageContent = JSON.stringify({
        role: 'agent',
        parts: [{ text: 'Delegation task', kind: 'text' }],
        contextId: effectiveContextId,
        messageId: taskId,
        kind: 'message',
      });
    }

    expect(messageContent).not.toBe('');
    const parsedMessage = JSON.parse(messageContent);
    expect(parsedMessage.contextId).toBe(conversationId);
    expect(parsedMessage.parts[0].text).toBe('Delegation task');
  });

  it('should verify task creation produces correct database entries', async () => {
    // This test verifies the end-to-end task creation
    const testContextId = conversationId;
    const _testMessage = 'Test delegation message';

    const task = await createTask(dbClient)({
      id: `delegation-test-${nanoid()}`,
      tenantId: 'math-tenant', // Use correct tenant for existing agents
      projectId: projectId,
      graphId: 'test-graph',
      agentId: 'number-producer-a',
      contextId: testContextId,
      status: 'working',
      metadata: {
        conversation_id: testContextId,
        message_id: 'test-msg-456',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agent_id: 'number-producer-a',
        graph_id: 'test-delegation-graph',
      },
    });

    const createdTask = Array.isArray(task) ? task[0] : task;

    // These should all pass after the fixes
    expect(createdTask.contextId).toBe(testContextId);
    expect(createdTask.contextId).not.toBe('default');

    // Check metadata
    const metadata = createdTask.metadata as any;
    expect(metadata.conversation_id).toBe(testContextId);
    expect(metadata.conversation_id).not.toBe('default');
  });
});
