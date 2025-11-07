import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createConversation,
  createOrGetConversation,
  deleteConversation,
  getActiveAgentForConversation,
  getConversation,
  getConversationHistory,
  listConversations,
  setActiveAgentForConversation,
  updateConversation,
  updateConversationActiveAgent,
} from '../../data-access/conversations';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';
import type { ConversationUpdate } from '../../types/index';

describe('Conversations Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testUserId = 'test-user';
  const testConversationId = 'test-conversation';

  beforeEach(async () => {
    db = await createTestDatabaseClient();
    vi.clearAllMocks();
  });

  describe('getConversation', () => {
    it('should retrieve a conversation by id', async () => {
      const conversationId = 'conv-1';
      const expectedConversation = {
        id: conversationId,
        tenantId: testTenantId,
        projectId: testProjectId,
        userId: testUserId,
        activeSubAgentId: 'agent-1',
        title: 'Test Conversation',
      };

      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(expectedConversation),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId,
      });

      expect(mockQuery.conversations.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedConversation);
    });

    it('should return null if conversation not found', async () => {
      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('getConversation', () => {
    it('should retrieve a conversation using simple parameters', async () => {
      const conversationId = 'conv-1';
      const expectedConversation = {
        id: conversationId,
        tenantId: testTenantId,
        projectId: testProjectId,
        userId: testUserId,
        activeSubAgentId: 'agent-1',
      };

      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(expectedConversation),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId,
      });

      expect(mockQuery.conversations.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedConversation);
    });
  });

  describe('listConversations', () => {
    it('should list conversations with pagination and count', async () => {
      const expectedConversations = [
        { id: 'conv-1', title: 'Conversation 1', userId: testUserId },
        { id: 'conv-2', title: 'Conversation 2', userId: testUserId },
      ];

      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(expectedConversations),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listConversations(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        userId: testUserId,
        pagination: { page: 1, limit: 10 },
      });

      expect(mockSelect).toHaveBeenCalledTimes(2); // Once for data, once for count
      expect(result).toEqual({
        conversations: expectedConversations,
        total: 2,
      });
    });

    it('should handle pagination without userId', async () => {
      const expectedConversations = [{ id: 'conv-1', title: 'Conversation 1' }];

      const mockSelect = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(expectedConversations),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listConversations(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
      });

      expect(result).toEqual({
        conversations: expectedConversations,
        total: 1,
      });
    });
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const conversationData = {
        id: 'conv-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        userId: testUserId,
        activeSubAgentId: 'agent-1',
        title: 'New Conversation',
        metadata: { userContext: { test: 'data' } },
      };

      const expectedConversation = {
        ...conversationData,
        tenantId: testTenantId,
        projectId: testProjectId,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedConversation]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createConversation(mockDb)({
        ...conversationData,
        id: conversationData.id,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedConversation);
    });

    it('should create a conversation without optional fields', async () => {
      const conversationData = {
        activeSubAgentId: 'agent-1',
        id: 'conv-1',
        tenantId: testTenantId,
        projectId: testProjectId,
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: expect.any(String),
              tenantId: testTenantId,
              projectId: testProjectId,
              activeSubAgentId: 'agent-1',
              createdAt: expect.any(String),
              updatedAt: expect.any(String),
            },
          ]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createConversation(mockDb)({
        ...conversationData,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(result.activeSubAgentId).toBe('agent-1');
    });
  });

  describe('updateConversation', () => {
    it('should update a conversation', async () => {
      const conversationId = 'conv-1';
      const updateData = {
        title: 'Updated Title',
        activeSubAgentId: 'agent-2',
        metadata: { updated: true },
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: conversationId,
                ...updateData,
                updatedAt: new Date().toISOString(),
              },
            ]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId,
        data: updateData as ConversationUpdate,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.title).toBe(updateData.title);
      expect(result.activeSubAgentId).toBe(updateData.activeSubAgentId);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation and its messages', async () => {
      const conversationId = 'conv-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId,
      });

      expect(mockDelete).toHaveBeenCalledTimes(2); // Once for messages, once for conversation
      expect(result).toBe(true);
    });

    it('should return false when deletion fails', async () => {
      const conversationId = 'conv-1';

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('Database error')),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      // Mock console.error to avoid test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await deleteConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId,
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('updateConversationActiveAgent', () => {
    it('should update the active agent for a conversation', async () => {
      const conversationId = 'conv-1';
      const newActiveAgentId = 'agent-2';

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: conversationId,
                activeSubAgentId: newActiveAgentId,
                updatedAt: new Date().toISOString(),
              },
            ]),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      const result = await updateConversationActiveAgent(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId,
        activeSubAgentId: newActiveAgentId,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.activeSubAgentId).toBe(newActiveAgentId);
    });
  });

  describe('createOrGetConversation', () => {
    it('should create a new conversation when none exists', async () => {
      const input = {
        tenantId: testTenantId,
        projectId: testProjectId,
        id: 'test-conversation',
        userId: testUserId,
        activeSubAgentId: 'agent-1',
        title: 'New Conversation',
        metadata: { userContext: { test: 'data' } },
      };

      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        insert: mockInsert,
      } as any;

      const result = await createOrGetConversation(mockDb)(input);

      expect(mockInsert).toHaveBeenCalled();
      expect(result.tenantId).toBe(testTenantId);
      expect(result.activeSubAgentId).toBe('agent-1');
    });

    it('should return existing conversation when found', async () => {
      const existingConversation = {
        tenantId: testTenantId,
        projectId: testProjectId,
        activeSubAgentId: 'agent-1',
        title: 'Existing Conversation',
      };

      const input = {
        id: 'test-conversation',
        tenantId: testTenantId,
        projectId: testProjectId,
        activeSubAgentId: 'agent-1',
        conversationId: 'conv-1',
      };

      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(existingConversation),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await createOrGetConversation(mockDb)(input);

      expect(mockQuery.conversations.findFirst).toHaveBeenCalled();
      expect(result).toEqual(existingConversation);
    });

    it('should update active agent when existing conversation has different agent', async () => {
      const existingConversation = {
        tenantId: testTenantId,
        projectId: testProjectId,
        activeSubAgentId: 'agent-1',
        title: 'Existing Conversation',
      };

      const input = {
        id: 'test-conversation',
        tenantId: testTenantId,
        projectId: testProjectId,
        activeSubAgentId: 'agent-2', // Different agent
        conversationId: 'conv-1',
      };

      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(existingConversation),
        },
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockDb = {
        ...db,
        query: mockQuery,
        update: mockUpdate,
      } as any;

      const result = await createOrGetConversation(mockDb)(input);

      expect(mockQuery.conversations.findFirst).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
      expect(result.activeSubAgentId).toBe('agent-2');
    });
  });

  describe('getActiveAgentForConversation', () => {
    it('should get active agent for a conversation', async () => {
      const expectedConversation = {
        id: testConversationId,
        tenantId: testTenantId,
        projectId: testProjectId,
        activeSubAgentId: 'agent-123',
        userId: 'user-123',
        title: 'Test Conversation',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(expectedConversation),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getActiveAgentForConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
      });

      expect(mockQuery.conversations.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedConversation);
    });

    it('should return null when conversation not found', async () => {
      const mockQuery = {
        conversations: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getActiveAgentForConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('setActiveAgentForConversation', () => {
    it('should set active agent for a conversation (upsert)', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await setActiveAgentForConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        subAgentId: 'agent-456',
      });

      expect(mockInsert).toHaveBeenCalled();
      const valuesCall = mockInsert().values;
      expect(valuesCall).toHaveBeenCalledWith({
        id: testConversationId,
        tenantId: testTenantId,
        projectId: testProjectId,
        activeSubAgentId: 'agent-456',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const onConflictCall = valuesCall().onConflictDoUpdate;
      expect(onConflictCall).toHaveBeenCalledWith({
        target: [expect.anything(), expect.anything(), expect.anything()],
        set: {
          activeSubAgentId: 'agent-456',
          updatedAt: expect.any(String),
        },
      });
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history with default settings', async () => {
      const mockMessages = [
        {
          id: 'msg-2',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: testConversationId,
          role: 'agent',
          content: { text: 'Hi there!' },
          messageType: 'chat',
          visibility: 'user-facing',
          createdAt: '2024-01-01T10:01:00Z',
        },
        {
          id: 'msg-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: testConversationId,
          role: 'user',
          content: { text: 'Hello' },
          messageType: 'chat',
          visibility: 'user-facing',
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockMessages),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getConversationHistory(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
      });

      // Should return messages in chronological order (oldest first)
      expect(result).toEqual(mockMessages.reverse());
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should filter by message types', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: testConversationId,
          role: 'user',
          content: { text: 'Hello' },
          messageType: 'chat',
          visibility: 'user-facing',
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockMessages),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getConversationHistory(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        options: {
          messageTypes: ['chat'],
        },
      });

      expect(result).toEqual(mockMessages.reverse());
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should limit results', async () => {
      const mockMessages: any[] = [];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockMessages),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      await getConversationHistory(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        options: {
          limit: 5,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
    });

    it('should handle visibility filter', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: testConversationId,
          role: 'user',
          content: { text: 'Hello' },
          messageType: 'chat',
          visibility: 'user-facing',
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockMessages),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      await getConversationHistory(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        options: {
          includeInternal: false,
        },
      });

      expect(mockSelect).toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getConversationHistory(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: 'non-existent',
      });

      expect(result).toEqual([]);
    });

    it('should include internal messages when specified', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          tenantId: testTenantId,
          projectId: testProjectId,
          conversationId: testConversationId,
          role: 'system',
          content: { text: 'Internal message' },
          messageType: 'chat',
          visibility: 'internal',
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockMessages),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getConversationHistory(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        options: {
          includeInternal: true,
        },
      });

      expect(result).toEqual(mockMessages.reverse());
      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors during conversation creation', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('DB Error')),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      await expect(
        createConversation(mockDb)({
          tenantId: testTenantId,
          projectId: testProjectId,
          id: 'conv-123',
          activeSubAgentId: 'agent-1',
        })
      ).rejects.toThrow('DB Error');
    });

    it('should handle database errors during history retrieval', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(new Error('DB Error')),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      await expect(
        getConversationHistory(mockDb)({
          scopes: { tenantId: testTenantId, projectId: testProjectId },
          conversationId: testConversationId,
        })
      ).rejects.toThrow('DB Error');
    });

    it('should handle database errors during conversation update', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('Update failed')),
          }),
        }),
      });

      const mockDb = {
        ...db,
        update: mockUpdate,
      } as any;

      await expect(
        updateConversation(mockDb)({
          scopes: { tenantId: testTenantId, projectId: testProjectId },
          conversationId: 'conv-123',
          data: { title: 'New Title' },
        })
      ).rejects.toThrow('Update failed');
    });

    it('should handle database errors during conversation deletion', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('Delete failed')),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: 'conv-123',
      });

      expect(result).toBe(false);
    });
  });
});
