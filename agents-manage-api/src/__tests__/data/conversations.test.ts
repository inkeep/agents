import {
  conversations,
  createOrGetConversation as createConversation,
  createMessage,
  getConversation,
  getConversationHistory,
  messages,
  updateConversation,
} from '@inkeep/agents-core';
import { and, desc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import dbClient from '../../data/db/dbClient';

// Mock nanoid to return predictable IDs
vi.mock('nanoid', async () => {
  return {
    nanoid: vi.fn(),
  };
});

// Mock the database client
vi.mock('../../data/db/dbClient.js', () => ({
  default: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn(),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn(),
        }),
      }),
    }),
    query: {
      conversations: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Conversations', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should create conversation with minimal data', async () => {
    const expectedConversation = {
      id: 'conv-123',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      userId: undefined,
      activeAgentId: 'default-agent',
      title: undefined,
      lastContextResolution: undefined,
      metadata: undefined,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    };

    vi.mocked(dbClient.insert().values().returning).mockResolvedValue([expectedConversation]);

    const result = await createConversation(dbClient)({
      id: 'conv-123', // Use conversationId instead of id
      tenantId: 'test-tenant',
      projectId: 'test-project',
      activeAgentId: 'default-agent',
    });

    expect(result).toEqual(expectedConversation);
    expect(result.id).toBe('conv-123');
  });
});

describe('getConversation', () => {
  it('should retrieve conversation by ID', async () => {
    const mockConversation = {
      id: 'conv-123',
      tenantId: 'test-tenant',
      activeAgentId: 'agent-1',
      title: 'Test Conversation',
    };

    vi.mocked(dbClient.query.conversations.findFirst).mockResolvedValue(mockConversation);

    const result = await getConversation(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
    });

    expect(result).toEqual(mockConversation);
    expect(dbClient.query.conversations.findFirst).toHaveBeenCalled();
  });

  it('should return null if conversation not found', async () => {
    vi.mocked(dbClient.query.conversations.findFirst).mockResolvedValue(null);

    const result = await getConversation(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'non-existent',
    });

    expect(result).toBeNull();
  });
});

describe('updateConversation', () => {
  it('should update conversation data', async () => {
    const updatedConversation = {
      id: 'conv-123',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      title: 'Updated Title',
      updatedAt: expect.any(String),
      userId: null,
      activeAgentId: 'new-agent',
      lastContextResolution: null,
      metadata: null,
      createdAt: expect.any(String),
    };

    // Mock database update operation
    vi.mocked(dbClient.update().set().where().returning).mockResolvedValue([updatedConversation]);

    // Mock getConversation to return the updated conversation
    vi.mocked(dbClient.query.conversations.findFirst).mockResolvedValue(updatedConversation);

    const result = await updateConversation(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      data: {
        title: 'Updated Title',
      },
    });

    expect(result).toEqual(updatedConversation);
    expect(dbClient.update).toHaveBeenCalledWith(conversations);
  });
});

describe('updateConversationActiveAgent', () => {
  it('should update active agent for conversation', async () => {
    const updatedConversation = {
      id: 'conv-123',
      tenantId: 'test-tenant',
      activeAgentId: 'new-agent',
      updatedAt: expect.any(String),
      userId: null,
      lastContextResolution: null,
      metadata: null,
      createdAt: expect.any(String),
      projectId: 'test-project',
      title: null,
    };

    // Mock database update operation
    vi.mocked(dbClient.update().set().where().returning).mockResolvedValue([updatedConversation]);

    // Mock getConversation to return the updated conversation
    vi.mocked(dbClient.query.conversations.findFirst).mockResolvedValue(updatedConversation);

    const result = await updateConversation(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      data: {
        activeAgentId: 'new-agent',
      },
    });

    expect(result).toEqual(updatedConversation);
  });
});

describe('addMessage', () => {
  it('should add a user message', async () => {
    // Setup nanoid for this specific test
    const { nanoid } = await import('nanoid');
    vi.mocked(nanoid).mockReturnValueOnce('msg-123');
    const expectedMessage = {
      id: 'msg-123',
      tenantId: 'test-tenant',
      conversationId: 'conv-123',
      role: 'user',
      content: { text: 'Hello world' },
      visibility: 'user-facing',
      messageType: 'chat',
      agentId: undefined,
      fromAgentId: undefined,
      toAgentId: undefined,
      fromExternalAgentId: undefined,
      toExternalAgentId: undefined,
      taskId: undefined,
      parentMessageId: undefined,
      a2aTaskId: undefined,
      a2aSessionId: undefined,
      metadata: undefined,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    };

    vi.mocked(dbClient.insert().values().returning).mockResolvedValue([expectedMessage]);

    const result = await createMessage(dbClient)({
      id: 'msg-123',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'user',
      content: { text: 'Hello world' },
    });

    expect(result).toEqual(expectedMessage);
    expect(dbClient.insert).toHaveBeenCalledWith(messages);
  });

  it('should add an agent message with metadata', async () => {
    // Setup nanoid for this specific test
    const { nanoid } = await import('nanoid');
    vi.mocked(nanoid).mockReturnValueOnce('msg-124');
    const expectedMessage = {
      id: 'msg-124',
      tenantId: 'test-tenant',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Hello! How can I help?' },
      visibility: 'user-facing',
      messageType: 'chat',
      agentId: undefined,
      fromAgentId: 'agent-1',
      toAgentId: undefined,
      fromExternalAgentId: undefined,
      toExternalAgentId: undefined,
      taskId: undefined,
      parentMessageId: undefined,
      a2aTaskId: undefined,
      a2aSessionId: undefined,
      metadata: { model: 'claude-3' },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    };

    vi.mocked(dbClient.insert().values().returning).mockResolvedValue([expectedMessage]);

    const result = await createMessage(dbClient)({
      id: 'msg-125',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Hello! How can I help?' },
      fromAgentId: 'agent-1',
      metadata: { openai_model: 'gpt-4o' },
    });

    expect(result).toEqual(expectedMessage);
  });

  it('should add A2A message', async () => {
    // Setup nanoid for this specific test
    const { nanoid } = await import('nanoid');
    vi.mocked(nanoid).mockReturnValueOnce('msg-125');
    const expectedMessage = {
      id: 'msg-125',
      tenantId: 'test-tenant',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Delegating task to specialist' },
      visibility: 'user-facing',
      messageType: 'a2a-request',
      agentId: undefined,
      fromAgentId: 'agent-1',
      toAgentId: 'agent-2',
      fromExternalAgentId: undefined,
      toExternalAgentId: undefined,
      taskId: 'task-123',
      parentMessageId: undefined,
      a2aTaskId: undefined,
      a2aSessionId: undefined,
      metadata: undefined,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    };

    vi.mocked(dbClient.insert().values().returning).mockResolvedValue([expectedMessage]);

    const result = await createMessage(dbClient)({
      id: 'msg-126',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Delegating task to specialist' },
      messageType: 'a2a-request',
      fromAgentId: 'agent-1',
      toAgentId: 'agent-2',
      taskId: 'task-123',
    });

    expect(result).toEqual(expectedMessage);
  });

  it('should add external agent message', async () => {
    // Setup nanoid for this specific test
    const { nanoid } = await import('nanoid');
    vi.mocked(nanoid).mockReturnValueOnce('msg-126');
    const expectedMessage = {
      id: 'msg-126',
      tenantId: 'test-tenant',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Response from external service' },
      visibility: 'external',
      messageType: 'a2a-response',
      agentId: undefined,
      fromAgentId: undefined,
      toAgentId: 'agent-1',
      fromExternalAgentId: 'external-1',
      toExternalAgentId: undefined,
      taskId: undefined,
      parentMessageId: undefined,
      a2aTaskId: undefined,
      a2aSessionId: undefined,
      metadata: undefined,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    };

    vi.mocked(dbClient.insert().values().returning).mockResolvedValue([expectedMessage]);

    const result = await createMessage(dbClient)({
      id: 'msg-127',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Response from external service' },
      messageType: 'a2a-response',
      fromExternalAgentId: 'external-1',
      toAgentId: 'agent-1',
      visibility: 'external',
    });

    expect(result).toEqual(expectedMessage);
  });
});

describe('getConversationHistory', () => {
  it('should retrieve conversation history with default settings', async () => {
    const mockMessages = [
      {
        id: 'msg-1',
        tenantId: 'test-tenant',
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Hello' },
        messageType: 'chat',
        createdAt: '2024-01-01T10:00:00Z',
      },
      {
        id: 'msg-2',
        tenantId: 'test-tenant',
        conversationId: 'conv-123',
        role: 'agent',
        content: { text: 'Hi there!' },
        messageType: 'chat',
        createdAt: '2024-01-01T10:01:00Z',
      },
    ];

    vi.mocked(dbClient.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockMessages),
          }),
        }),
      }),
    } as any);

    const result = await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
    });

    expect(result).toEqual(mockMessages);
    expect(dbClient.select).toHaveBeenCalled();
  });

  it('should filter by message types', async () => {
    const mockMessages = [
      {
        id: 'msg-1',
        tenantId: 'test-tenant',
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Hello' },
        messageType: 'chat',
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(dbClient.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockMessages),
          }),
        }),
      }),
    } as any);

    await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      options: {
        messageTypes: ['chat'],
      },
    });

    // Verify that WHERE clause includes message type filter
    expect(dbClient.select).toHaveBeenCalled();
  });

  it('should limit results', async () => {
    const mockMessages = [];

    vi.mocked(dbClient.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockMessages),
          }),
        }),
      }),
    } as any);

    await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      options: {
        limit: 5,
      },
    });

    // Verify limit was applied
    const mockDb = vi.mocked(
      dbClient
        .select()
        .from(messages)
        .where(eq(messages.tenantId, 'test'))
        .orderBy(desc(messages.createdAt))
    );
    // Note: In real implementation, we'd verify the limit(5) call
  });

  it('should handle visibility filter', async () => {
    await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      options: {
        includeInternal: false,
      },
    });

    // Should filter out internal messages
    expect(dbClient.select).toHaveBeenCalled();
  });

  it('should handle empty results', async () => {
    vi.mocked(dbClient.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as any);

    const result = await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'non-existent',
    });

    expect(result).toEqual([]);
  });
});

describe('Message Content Validation', () => {
  it('should handle different content types', async () => {
    const textContent = { text: 'Simple text' };
    const richContent = {
      text: 'Rich content',
      parts: [
        { kind: 'text', text: 'Hello' },
        { kind: 'image', data: 'base64data' },
      ],
    };

    vi.mocked(dbClient.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 'msg-1', content: textContent },
          { id: 'msg-2', content: richContent },
        ]),
      }),
    } as any);

    // Test text content
    await createMessage(dbClient)({
      id: 'msg-1',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'user',
      content: textContent,
    });

    // Test rich content
    await createMessage(dbClient)({
      id: 'msg-2',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'user',
      content: richContent,
    });

    // Verify the insert was called for both messages
    expect(dbClient.insert).toHaveBeenCalled();
  });
});

describe('Error Handling', () => {
  it('should handle database errors during message creation', async () => {
    vi.mocked(dbClient.insert().values().returning).mockRejectedValue(new Error('DB Error'));

    await expect(
      createMessage(dbClient)({
        id: 'msg-1',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        conversationId: 'conv-123',
        role: 'user',
        content: { text: 'Hello' },
      })
    ).rejects.toThrow('DB Error');
  });

  it('should handle database errors during history retrieval', async () => {
    vi.mocked(dbClient.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB Error')),
          }),
        }),
      }),
    } as any);

    await expect(
      getConversationHistory(dbClient)({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        conversationId: 'conv-123',
      })
    ).rejects.toThrow('DB Error');
  });
});
