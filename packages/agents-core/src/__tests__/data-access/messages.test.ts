import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countMessagesByConversation,
  createMessage,
  deleteMessage,
  getMessageById,
  getMessagesByConversation,
  getMessagesByTask,
  getVisibleMessages,
  listMessages,
  updateMessage,
} from '../../data-access/messages';
import type { DatabaseClient } from '../../db/client';
import { testDbClient } from '../setup';

describe('Messages Data Access', () => {
  let db: DatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';
  const testConversationId = 'test-conversation';
  const testTaskId = 'test-task';

  beforeEach(async () => {
    db = testDbClient;
    vi.clearAllMocks();
  });

  describe('getMessageById', () => {
    it('should retrieve a message by id', async () => {
      const messageId = 'msg-1';
      const expectedMessage = {
        id: messageId,
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Hello world' },
      };

      const mockQuery = {
        messages: {
          findFirst: vi.fn().mockResolvedValue(expectedMessage),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getMessageById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        messageId,
      });

      expect(mockQuery.messages.findFirst).toHaveBeenCalled();
      expect(result).toEqual(expectedMessage);
    });

    it('should return null if message not found', async () => {
      const mockQuery = {
        messages: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        ...db,
        query: mockQuery,
      } as any;

      const result = await getMessageById(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        messageId: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listMessages', () => {
    it('should list messages with pagination', async () => {
      const expectedMessages = [
        { id: 'msg-1', role: 'user', content: { text: 'Message 1' } },
        { id: 'msg-2', role: 'agent', content: { text: 'Message 2' } },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedMessages),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await listMessages(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        pagination: { page: 1, limit: 10 },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedMessages);
    });
  });

  describe('getMessagesByConversation', () => {
    it('should get messages for a conversation with desc order', async () => {
      const expectedMessages = [
        { id: 'msg-2', role: 'agent', content: { text: 'Latest message' } },
        { id: 'msg-1', role: 'user', content: { text: 'First message' } },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedMessages),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getMessagesByConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        pagination: { page: 1, limit: 10 },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedMessages);
    });

    it('should get messages with asc order by default', async () => {
      const expectedMessages = [
        { id: 'msg-1', role: 'user', content: { text: 'First message' } },
        { id: 'msg-2', role: 'agent', content: { text: 'Second message' } },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedMessages),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getMessagesByConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        pagination: { page: 1, limit: 10 },
      });

      expect(result).toEqual(expectedMessages);
    });
  });

  describe('getMessagesByTask', () => {
    it('should get messages for a specific task', async () => {
      const expectedMessages = [
        { id: 'msg-1', taskId: testTaskId, content: { text: 'Task message 1' } },
        { id: 'msg-2', taskId: testTaskId, content: { text: 'Task message 2' } },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedMessages),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getMessagesByTask(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        taskId: testTaskId,
        pagination: { page: 1, limit: 10 },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedMessages);
    });
  });

  describe('getVisibleMessages', () => {
    it('should get user-facing messages by default', async () => {
      const expectedMessages = [
        { id: 'msg-1', visibility: 'user-facing', content: { text: 'Visible message' } },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedMessages),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getVisibleMessages(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        pagination: { page: 1, limit: 10 },
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toEqual(expectedMessages);
    });

    it('should filter by custom visibility options', async () => {
      const expectedMessages = [
        { id: 'msg-1', visibility: 'internal', content: { text: 'Internal message' } },
        { id: 'msg-2', visibility: 'external', content: { text: 'External message' } },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(expectedMessages),
              }),
            }),
          }),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await getVisibleMessages(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
        pagination: { page: 1, limit: 10 },
        visibility: ['internal', 'external'],
      });

      expect(result).toEqual(expectedMessages);
    });
  });

  describe('createMessage', () => {
    it('should create a new message', async () => {
      const messageData = {
        id: 'msg-1',
        tenantId: testTenantId,
        projectId: testProjectId,
        conversationId: testConversationId,
        role: 'user',
        content: { text: 'Hello world' },
        visibility: 'user-facing',
        messageType: 'chat',
        metadata: {
          openai_model: 'gpt-4o',
          finish_reason: 'stop',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
          },
        },
      };

      const expectedMessage = {
        ...messageData,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([expectedMessage]),
        }),
      });

      const mockDb = {
        ...db,
        insert: mockInsert,
      } as any;

      const result = await createMessage(mockDb)(messageData);

      expect(mockInsert).toHaveBeenCalled();
      expect(result).toEqual(expectedMessage);
    });

    it('should create a message with default values', async () => {
      const messageData = {
        id: 'msg-1',
        conversationId: testConversationId,
        role: 'agent',
        content: { text: 'Agent response' },
      };

      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              tenantId: testTenantId,
              projectId: testProjectId,
              ...messageData,
              visibility: 'user-facing',
              messageType: 'chat',
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

      const result = await createMessage(mockDb)({
        tenantId: testTenantId,
        projectId: testProjectId,
        ...messageData,
      });

      expect(result.visibility).toBe('user-facing');
      expect(result.messageType).toBe('chat');
    });
  });

  describe('updateMessage', () => {
    it('should update a message', async () => {
      const messageId = 'msg-1';
      const updateData = {
        content: { text: 'Updated content' },
        metadata: { finish_reason: 'stop' },
      };

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: messageId,
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

      const result = await updateMessage(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        messageId,
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.content).toEqual(updateData.content);
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      const messageId = 'msg-1';
      const deletedMessage = {
        id: messageId,
        tenantId: testTenantId,
        projectId: testProjectId,
        role: 'user',
        content: { text: 'Deleted message' },
      };

      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([deletedMessage]),
        }),
      });

      const mockDb = {
        ...db,
        delete: mockDelete,
      } as any;

      const result = await deleteMessage(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        messageId,
      });

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toEqual(deletedMessage);
    });
  });

  describe('countMessagesByConversation', () => {
    it('should return message count for a conversation', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 5 }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countMessagesByConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
      });

      expect(mockSelect).toHaveBeenCalled();
      expect(result).toBe(5);
    });

    it('should handle string count values', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: '10' }]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countMessagesByConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
      });

      expect(result).toBe(10);
    });

    it('should return 0 when no count result', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockDb = {
        ...db,
        select: mockSelect,
      } as any;

      const result = await countMessagesByConversation(mockDb)({
        scopes: { tenantId: testTenantId, projectId: testProjectId },
        conversationId: testConversationId,
      });

      expect(result).toBe(0);
    });
  });
});
