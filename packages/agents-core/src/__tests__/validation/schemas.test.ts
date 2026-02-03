import { describe, expect, it } from 'vitest';
import {
  ConversationInsertSchema,
  MessageInsertSchema,
  PaginationQueryParamsSchema,
  PaginationSchema,
  ResourceIdSchema,
  SubAgentApiInsertSchema,
  SubAgentApiUpdateSchema,
  SubAgentInsertSchema,
  TaskInsertSchema,
  TriggerInsertSchema,
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
        expect(() => ResourceIdSchema.parse(id)).not.toThrow();
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
        'new', // reserved
      ];

      for (const id of invalidIds) {
        expect(() => ResourceIdSchema.parse(id)).toThrow();
      }
    });
  });

  describe('SubAgentInsertSchema', () => {
    it('should validate a complete sub-agent insert object', () => {
      const validSubAgent = {
        id: 'test-sub-agent',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Sub-Agent',
        description: 'A test sub-agent',
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

      expect(() => SubAgentInsertSchema.parse(validSubAgent)).not.toThrow();
    });

    it('should validate minimal sub-agent insert object', () => {
      const minimalSubAgent = {
        id: 'test-sub-agent',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Sub-Agent',
        description: 'A test sub-agent',
        prompt: 'Test prompt',
      };

      expect(() => SubAgentInsertSchema.parse(minimalSubAgent)).not.toThrow();
    });

    it('should reject invalid sub-agent insert object', () => {
      const invalidSubAgent = {
        // missing required fields
        id: 'test-sub-agent',
        name: 'Test Sub-Agent',
      };

      expect(() => SubAgentInsertSchema.parse(invalidSubAgent)).toThrow();
    });
  });

  describe('SubAgentApiUpdateSchema', () => {
    it('should allow partial updates', () => {
      const partialUpdate = {
        name: 'Updated Name',
      };

      expect(() => SubAgentApiUpdateSchema.parse(partialUpdate)).not.toThrow();
    });

    it('should allow empty update object', () => {
      const emptyUpdate = {};
      expect(() => SubAgentApiUpdateSchema.parse(emptyUpdate)).not.toThrow();
    });

    it('should not allow tenantId or projectId in updates', () => {
      const invalidUpdate = {
        tenantId: 'new-tenant',
        name: 'Updated Name',
      };

      // This should not throw because tenantId is omitted from the schema
      const result = SubAgentApiUpdateSchema.parse(invalidUpdate);
      expect(result).not.toHaveProperty('tenantId');
    });
  });

  describe('SubAgentApiInsertSchema', () => {
    it('should accept sub-agent data without tenant/project IDs', () => {
      const apiSubAgent = {
        id: 'test-sub-agent',
        name: 'Test Sub-Agent',
        description: 'A test sub-agent',
        prompt: 'Test prompt',
      };

      expect(() => SubAgentApiInsertSchema.parse(apiSubAgent)).not.toThrow();
    });

    it('should reject sub-agent data with tenant/project IDs', () => {
      const apiSubAgent = {
        id: 'test-sub-agent',
        tenantId: 'tenant-1', // Should be omitted in API schema
        name: 'Test Sub-Agent',
        description: 'A test sub-agent',
        prompt: 'Test prompt',
      };

      const result = SubAgentApiInsertSchema.parse(apiSubAgent);
      expect(result).not.toHaveProperty('tenantId');
    });
  });

  describe('TaskInsertSchema', () => {
    const testRef = {
      type: 'branch' as const,
      name: 'main',
      hash: 'a1b2c3d4e5f67890123456789012345v',
    };

    it('should validate a complete task insert object', () => {
      const validTask = {
        id: 'task-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        subAgentId: 'sub-agent-1',
        contextId: 'context-1',
        status: 'pending',
        ref: testRef,
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
        agentId: 'agent-1',
        subAgentId: 'sub-agent-1',
        contextId: 'context-1',
        status: 'pending',
        ref: testRef,
      };

      expect(() => TaskInsertSchema.parse(minimalTask)).not.toThrow();
    });
  });

  describe('ConversationInsertSchema', () => {
    const testRef = {
      type: 'branch' as const,
      name: 'main',
      hash: 'a1b2c3d4e5f67890123456789012345v',
    };

    it('should validate a conversation insert object', () => {
      const validConversation = {
        id: 'conv-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        userId: 'user-1',
        activeSubAgentId: 'sub-agent-1',
        title: 'Test Conversation',
        ref: testRef,
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

  describe('TriggerInsertSchema', () => {
    it('should validate trigger without signatureVerification', () => {
      const validTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Trigger',
        description: 'A test trigger',
        enabled: true,
      };

      expect(() => TriggerInsertSchema.parse(validTrigger)).not.toThrow();
    });

    it('should validate trigger with valid signatureVerification config', () => {
      const validTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'GitHub Webhook Trigger',
        description: 'GitHub webhook',
        enabled: true,
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'hex',
          signature: {
            source: 'header',
            key: 'x-hub-signature-256',
            prefix: 'sha256=',
          },
          signedComponents: [
            {
              source: 'body',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '',
          },
        },
      };

      expect(() => TriggerInsertSchema.parse(validTrigger)).not.toThrow();
    });

    it('should reject trigger with invalid regex in signature', () => {
      const invalidTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Trigger',
        enabled: true,
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'hex',
          signature: {
            source: 'header',
            key: 'x-signature',
            regex: '[invalid(regex',
          },
          signedComponents: [
            {
              source: 'body',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '',
          },
        },
      };

      expect(() => TriggerInsertSchema.parse(invalidTrigger)).toThrow(/Invalid regex pattern/);
    });

    it('should reject trigger with invalid JMESPath in signature.key', () => {
      const invalidTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Trigger',
        enabled: true,
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'hex',
          signature: {
            source: 'body',
            key: 'invalid[[[jmespath',
          },
          signedComponents: [
            {
              source: 'body',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '',
          },
        },
      };

      expect(() => TriggerInsertSchema.parse(invalidTrigger)).toThrow(
        /Invalid JMESPath expression/
      );
    });

    it('should reject trigger with invalid regex in signedComponent', () => {
      const invalidTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Trigger',
        enabled: true,
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'hex',
          signature: {
            source: 'header',
            key: 'x-signature',
          },
          signedComponents: [
            {
              source: 'header',
              key: 'x-timestamp',
              regex: '**invalid**',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '',
          },
        },
      };

      expect(() => TriggerInsertSchema.parse(invalidTrigger)).toThrow(/Invalid regex pattern/);
    });

    it('should reject trigger with invalid JMESPath in signedComponent.key', () => {
      const invalidTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Trigger',
        enabled: true,
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'hex',
          signature: {
            source: 'header',
            key: 'x-signature',
          },
          signedComponents: [
            {
              source: 'body',
              key: 'data[[invalid',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '',
          },
        },
      };

      expect(() => TriggerInsertSchema.parse(invalidTrigger)).toThrow(
        /Invalid JMESPath expression/
      );
    });

    it('should validate trigger with valid JMESPath expressions', () => {
      const validTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Trigger',
        enabled: true,
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'base64',
          signature: {
            source: 'body',
            key: 'signature.value',
          },
          signedComponents: [
            {
              source: 'body',
              key: 'data.timestamp',
              required: true,
            },
            {
              source: 'body',
              key: 'payload.body',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: '.',
          },
        },
      };

      expect(() => TriggerInsertSchema.parse(validTrigger)).not.toThrow();
    });

    it('should validate trigger with valid regex patterns', () => {
      const validTrigger = {
        id: 'trigger-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Trigger',
        enabled: true,
        signatureVerification: {
          algorithm: 'sha256',
          encoding: 'hex',
          signature: {
            source: 'header',
            key: 'x-signature',
            regex: '^v0=([a-f0-9]+)$',
          },
          signedComponents: [
            {
              source: 'header',
              key: 'x-timestamp',
              regex: '^t=([0-9]+)$',
              required: true,
            },
          ],
          componentJoin: {
            strategy: 'concatenate',
            separator: ':',
          },
        },
      };

      expect(() => TriggerInsertSchema.parse(validTrigger)).not.toThrow();
    });
  });
});
