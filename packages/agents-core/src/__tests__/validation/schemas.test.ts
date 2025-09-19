import { describe, expect, it } from 'vitest';
import {
  AgentApiInsertSchema,
  AgentApiUpdateSchema,
  AgentInsertSchema,
  ConversationInsertSchema,
  MessageInsertSchema,
  PaginationQueryParamsSchema,
  PaginationSchema,
  resourceIdSchema,
  TaskInsertSchema,
} from '../../validation/schemas';

describe('Validation Schemas', () => {
  describe('resourceIdSchema', () => {
    it('should accept valid resource IDs', () => {
      const validIds = [
        'test-id',
        'test_id',
        'test.id',
        'test123',
        'TEST-ID',
        'a',
        'agent-with-very-long-name-123',
      ];

      for (const id of validIds) {
        expect(() => resourceIdSchema.parse(id)).not.toThrow();
      }
    });

    it('should reject invalid resource IDs', () => {
      const invalidIds = [
        '', // empty
        'test@id', // invalid character
        'test id', // space
        'test/id', // slash
        'test\\id', // backslash
        'a'.repeat(256), // too long
      ];

      for (const id of invalidIds) {
        expect(() => resourceIdSchema.parse(id)).toThrow();
      }
    });
  });

  describe('AgentInsertSchema', () => {
    it('should validate a complete agent insert object', () => {
      const validAgent = {
        id: 'test-agent',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        graphId: 'graph-1',
        name: 'Test Agent',
        description: 'A test agent',
        prompt: 'Test prompt',
        models: {
          base: {
            model: 'gpt-4',
            providerOptions: {
              openai: {
                temperature: 0.7,
              },
            },
          },
          structuredOutput: {
            model: 'gpt-4o-mini',
          },
        },
      };

      expect(() => AgentInsertSchema.parse(validAgent)).not.toThrow();
    });

    it('should validate minimal agent insert object', () => {
      const minimalAgent = {
        id: 'test-agent',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        graphId: 'graph-1',
        name: 'Test Agent',
        description: 'A test agent',
        prompt: 'Test prompt',
      };

      expect(() => AgentInsertSchema.parse(minimalAgent)).not.toThrow();
    });

    it('should reject invalid agent insert object', () => {
      const invalidAgent = {
        // missing required fields
        id: 'test-agent',
        name: 'Test Agent',
      };

      expect(() => AgentInsertSchema.parse(invalidAgent)).toThrow();
    });
  });

  describe('AgentUpdateSchema', () => {
    it('should allow partial updates', () => {
      const partialUpdate = {
        name: 'Updated Name',
      };

      expect(() => AgentApiUpdateSchema.parse(partialUpdate)).not.toThrow();
    });

    it('should allow empty update object', () => {
      const emptyUpdate = {};
      expect(() => AgentApiUpdateSchema.parse(emptyUpdate)).not.toThrow();
    });

    it('should not allow tenantId or projectId in updates', () => {
      const invalidUpdate = {
        tenantId: 'new-tenant',
        name: 'Updated Name',
      };

      // This should not throw because tenantId is omitted from the schema
      const result = AgentApiUpdateSchema.parse(invalidUpdate);
      expect(result).not.toHaveProperty('tenantId');
    });
  });

  describe('AgentApiInsertSchema', () => {
    it('should accept agent data without tenant/project IDs', () => {
      const apiAgent = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        prompt: 'Test prompt',
      };

      expect(() => AgentApiInsertSchema.parse(apiAgent)).not.toThrow();
    });

    it('should reject agent data with tenant/project IDs', () => {
      const apiAgent = {
        id: 'test-agent',
        tenantId: 'tenant-1', // Should be omitted in API schema
        name: 'Test Agent',
        description: 'A test agent',
        prompt: 'Test prompt',
      };

      const result = AgentApiInsertSchema.parse(apiAgent);
      expect(result).not.toHaveProperty('tenantId');
    });
  });

  describe('TaskInsertSchema', () => {
    it('should validate a complete task insert object', () => {
      const validTask = {
        id: 'task-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        contextId: 'context-1',
        status: 'pending',
        agentId: 'agent-1',
        metadata: {
          priority: 'high',
          tags: ['urgent', 'customer'],
        },
      };

      expect(() => TaskInsertSchema.parse(validTask)).not.toThrow();
    });

    it('should validate minimal task insert object', () => {
      const minimalTask = {
        id: 'task-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        contextId: 'context-1',
        status: 'pending',
        agentId: 'agent-1',
      };

      expect(() => TaskInsertSchema.parse(minimalTask)).not.toThrow();
    });
  });

  describe('ConversationInsertSchema', () => {
    it('should validate a conversation insert object', () => {
      const validConversation = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        userId: 'user-1',
        activeAgentId: 'agent-1',
        title: 'Test Conversation',
        metadata: {
          source: 'web',
          userAgent: 'Mozilla/5.0...',
        },
      };

      expect(() => ConversationInsertSchema.parse(validConversation)).not.toThrow();
    });
  });

  describe('MessageInsertSchema', () => {
    it('should validate a message insert object', () => {
      const validMessage = {
        id: 'msg-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        role: 'user',
        content: {
          text: 'Hello, world!',
        },
        visibility: 'user-facing',
        messageType: 'chat',
      };

      expect(() => MessageInsertSchema.parse(validMessage)).not.toThrow();
    });
  });

  describe('PaginationSchema', () => {
    it('should validate pagination object with defaults', () => {
      const pagination = {
        total: 100,
        pages: 10,
      };

      const result = PaginationSchema.parse(pagination);
      expect(result.page).toBe(1); // default
      expect(result.limit).toBe(10); // default
      expect(result.total).toBe(100);
      expect(result.pages).toBe(10);
    });

    it('should validate pagination object with custom values', () => {
      const pagination = {
        page: 2,
        limit: 20,
        total: 100,
        pages: 5,
      };

      expect(() => PaginationSchema.parse(pagination)).not.toThrow();
    });

    it('should enforce minimum page number', () => {
      const invalidPagination = {
        page: 0, // invalid
        total: 100,
        pages: 10,
      };

      expect(() => PaginationSchema.parse(invalidPagination)).toThrow();
    });

    it('should enforce maximum limit', () => {
      const invalidPagination = {
        limit: 101, // exceeds max of 100
        total: 1000,
        pages: 10,
      };

      expect(() => PaginationSchema.parse(invalidPagination)).toThrow();
    });
  });

  describe('PaginationQueryParamsSchema', () => {
    it('should coerce string numbers to numbers', () => {
      const queryParams = {
        page: '2',
        limit: '50',
      } as any;

      const result = PaginationQueryParamsSchema.parse(queryParams);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should use defaults for missing values', () => {
      const queryParams = {};

      const result = PaginationQueryParamsSchema.parse(queryParams);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should enforce limits on coerced values', () => {
      const invalidParams = {
        page: '0',
        limit: '150',
      } as any;

      expect(() => PaginationQueryParamsSchema.parse(invalidParams)).toThrow();
    });
  });
});
