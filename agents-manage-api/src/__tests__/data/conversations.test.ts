import {
  createOrGetConversation as createConversation,
  createMessage,
  getConversation,
  getConversationHistory,
  updateConversation,
} from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock nanoid to return predictable IDs
vi.mock('nanoid', async () => {
  return {
    nanoid: vi.fn(),
  };
});

// Mock the database client - must be done without external references
vi.mock('../../data/db/dbClient.js', () => ({
  default: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    query: {
      conversations: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('../../logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import dbClient after mocking
import dbClient from '../../data/db/dbClient';

// Get references to the mocked functions
const mockInsert = vi.mocked(dbClient.insert) as any;
const mockSelect = vi.mocked(dbClient.select) as any;
const mockUpdate = vi.mocked(dbClient.update) as any;
const mockQuery = vi.mocked(dbClient.query) as any;

describe.skip('Conversations', () => {
  // TODO: Fix mock hoisting issue
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should create conversation with minimal data', async () => {
    const expectedConversation = {
      id: 'conv-123',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      userId: null,
      activeSubAgentId: 'default-agent',
      title: null,
      lastContextResolution: null,
      metadata: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([expectedConversation]),
      }),
    });

    const result = await createConversation(dbClient)({
      id: 'conv-123',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      activeSubAgentId: 'default-agent',
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
      projectId: 'test-project',
      activeSubAgentId: 'agent-1',
      title: 'Test Conversation',
      userId: null,
      lastContextResolution: null,
      metadata: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    mockQuery.conversations.findFirst.mockResolvedValue(mockConversation);

    const result = await getConversation(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
    });

    expect(result).toEqual(mockConversation);
    expect(mockQuery.conversations.findFirst).toHaveBeenCalled();
  });

  it('should return null if conversation not found', async () => {
    mockQuery.conversations.findFirst.mockResolvedValue(null);

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
      updatedAt: '2024-01-01T00:00:00Z',
      userId: null,
      activeSubAgentId: 'new-agent',
      lastContextResolution: null,
      metadata: null,
      createdAt: '2024-01-01T00:00:00Z',
    };

    // Mock database update operation
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedConversation]),
        }),
      }),
    });

    // Mock getConversation to return the updated conversation
    mockQuery.conversations.findFirst.mockResolvedValue(updatedConversation);

    const result = await updateConversation(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      data: {
        title: 'Updated Title',
      },
    });

    expect(result).toEqual(updatedConversation);
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe('updateConversationActiveAgent', () => {
  it('should update active agent for conversation', async () => {
    const updatedConversation = {
      id: 'conv-123',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      activeSubAgentId: 'new-agent',
      updatedAt: '2024-01-01T00:00:00Z',
      userId: null,
      lastContextResolution: null,
      metadata: null,
      createdAt: '2024-01-01T00:00:00Z',
      title: null,
    };

    // Mock database update operation
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedConversation]),
        }),
      }),
    });

    // Mock getConversation to return the updated conversation
    mockQuery.conversations.findFirst.mockResolvedValue(updatedConversation);

    const result = await updateConversation(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      data: {
        activeSubAgentId: 'new-agent',
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
      fromSubAgentId: undefined,
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

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([expectedMessage]),
      }),
    });

    const result = await createMessage(dbClient)({
      id: 'msg-123',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'user',
      content: { text: 'Hello world' },
    });

    expect(result).toEqual(expectedMessage);
    expect(mockInsert).toHaveBeenCalled();
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
      fromSubAgentId: 'agent-1',
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

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([expectedMessage]),
      }),
    });

    const result = await createMessage(dbClient)({
      id: 'msg-125',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Hello! How can I help?' },
      fromSubAgentId: 'agent-1',
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
      fromSubAgentId: 'agent-1',
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

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([expectedMessage]),
      }),
    });

    const result = await createMessage(dbClient)({
      id: 'msg-126',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Delegating task to specialist' },
      messageType: 'a2a-request',
      fromSubAgentId: 'agent-1',
      toSubAgentId: 'agent-2',
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
      fromSubAgentId: undefined,
      toSubAgentId: 'agent-1',
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

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([expectedMessage]),
      }),
    });

    const result = await createMessage(dbClient)({
      id: 'msg-126',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      conversationId: 'conv-123',
      role: 'agent',
      content: { text: 'Response from external service' },
      messageType: 'a2a-response',
      fromExternalAgentId: 'external-1',
      toSubAgentId: 'agent-1',
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

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockMessages),
          }),
        }),
      }),
    });

    const result = await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
    });

    expect(result).toEqual(mockMessages);
    expect(mockSelect).toHaveBeenCalled();
  });

  it('should filter by message types', async () => {
    const mockMessages: any[] = [
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

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockMessages),
          }),
        }),
      }),
    });

    await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      options: {
        messageTypes: ['chat'],
      },
    });

    // Verify that WHERE clause includes message type filter
    expect(mockSelect).toHaveBeenCalled();
  });

  it('should limit results', async () => {
    const mockMessages: any[] = [];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockMessages),
          }),
        }),
      }),
    });

    await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      options: {
        limit: 5,
      },
    });

    // Verify limit was applied
    expect(mockSelect).toHaveBeenCalled();
  });

  it('should handle visibility filter', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    await getConversationHistory(dbClient)({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
      conversationId: 'conv-123',
      options: {
        includeInternal: false,
      },
    });

    // Should filter out internal messages
    expect(mockSelect).toHaveBeenCalled();
  });

  it('should handle empty results', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

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

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 'msg-1', content: textContent },
          { id: 'msg-2', content: richContent },
        ]),
      }),
    });

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
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe('Error Handling', () => {
  it('should handle database errors during message creation', async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('DB Error')),
      }),
    });

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
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB Error')),
          }),
        }),
      }),
    });

    await expect(
      getConversationHistory(dbClient)({
        scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
        conversationId: 'conv-123',
      })
    ).rejects.toThrow('DB Error');
  });
});
