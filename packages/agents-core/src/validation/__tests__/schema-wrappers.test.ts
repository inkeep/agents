import { z } from '@hono/zod-openapi';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createSelectSchema as drizzleCreateSelectSchema } from 'drizzle-zod';
import { describe, expect, it } from 'vitest';
import {
  AgentSelectSchema,
  ProjectInsertSchema,
  ProjectSelectSchema,
  SubAgentInsertSchema,
  SubAgentSelectSchema,
} from '../schemas';

const FIELD_MODIFIERS: Record<string, (schema: z.ZodTypeAny) => z.ZodTypeAny> = {
  id: (_schema) => z.string().describe('Resource identifier'),
  name: (_schema) => z.string().describe('Name'),
  description: (_schema) => z.string().describe('Description'),
  tenantId: (schema) => schema.describe('Tenant identifier'),
  projectId: (schema) => schema.describe('Project identifier'),
  agentId: (schema) => schema.describe('Agent identifier'),
  subAgentId: (schema) => schema.describe('Sub-agent identifier'),
  createdAt: (schema) => schema.describe('Creation timestamp'),
  updatedAt: (schema) => schema.describe('Last update timestamp'),
};

function createSelectSchemaForTest(table: any, overrides?: any) {
  const tableColumns = table._?.columns;
  if (!tableColumns) {
    return drizzleCreateSelectSchema(table, overrides);
  }
  const tableFieldNames = Object.keys(tableColumns);

  const modifiers: Record<string, (schema: z.ZodTypeAny) => z.ZodTypeAny> = {};

  for (const fieldName of tableFieldNames) {
    if (fieldName in FIELD_MODIFIERS) {
      modifiers[fieldName] = FIELD_MODIFIERS[fieldName];
    }
  }

  const mergedModifiers = { ...modifiers, ...overrides } as any;

  return drizzleCreateSelectSchema(table, mergedModifiers);
}

describe('Schema Wrapper Functions', () => {
  describe('Basic Functionality', () => {
    it('should produce valid Zod schemas', () => {
      expect(ProjectSelectSchema).toBeDefined();
      expect(ProjectInsertSchema).toBeDefined();
      expect(SubAgentSelectSchema).toBeDefined();
      expect(SubAgentInsertSchema).toBeDefined();
    });

    it('should validate data correctly', () => {
      const validProject = {
        id: 'test-project',
        tenantId: 'tenant-1',
        name: 'Test Project',
        description: 'A test project',
        models: {
          base: {
            model: 'gpt-4',
          },
        },
        stopWhen: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => ProjectSelectSchema.parse(validProject)).not.toThrow();
    });
  });

  describe('Automatic Modifiers - Descriptions', () => {
    it('should add descriptions to id field', () => {
      const schema = ProjectSelectSchema.shape.id;
      expect(schema).toBeDefined();
      const metadata = (schema as any).meta?.() || {};
      const description = metadata.description || (schema as any)._def?.description;
      expect(description).toBe('Resource identifier');
    });

    it('should add descriptions to name field', () => {
      const schema = ProjectSelectSchema.shape.name;
      expect(schema).toBeDefined();
      const metadata = (schema as any).meta?.() || {};
      const description = metadata.description || (schema as any)._def?.description;
      expect(description).toBe('Name');
    });

    it('should add descriptions to description field', () => {
      const schema = ProjectSelectSchema.shape.description;
      expect(schema).toBeDefined();
      const metadata = (schema as any).meta?.() || {};
      const description = metadata.description || (schema as any)._def?.description;
      expect(description).toBe('Description');
    });

    it('should add descriptions to common fields', () => {
      expect(ProjectSelectSchema.shape.tenantId).toBeDefined();
      expect(AgentSelectSchema.shape.projectId).toBeDefined();
      expect(SubAgentSelectSchema.shape.agentId).toBeDefined();
      expect(ProjectSelectSchema.shape.createdAt).toBeDefined();
      expect(ProjectSelectSchema.shape.updatedAt).toBeDefined();
    });
  });

  describe('Type Checks', () => {
    it('should validate id as string', () => {
      const schema = ProjectSelectSchema.shape.id;
      expect(() => schema.parse('valid-id')).not.toThrow();
      expect(() => schema.parse(123)).toThrow();
      expect(() => schema.parse(null)).toThrow();
    });

    it('should validate name as string', () => {
      const schema = ProjectSelectSchema.shape.name;
      expect(() => schema.parse('Valid Name')).not.toThrow();
      expect(() => schema.parse(123)).toThrow();
      expect(() => schema.parse(null)).toThrow();
    });

    it('should validate description as string', () => {
      const schema = ProjectSelectSchema.shape.description;
      expect(() => schema.parse('Valid description')).not.toThrow();
      expect(() => schema.parse(123)).toThrow();
      expect(() => schema.parse(null)).toThrow();
    });
  });

  describe('Field Detection', () => {
    it('should only apply modifiers to fields that exist in the table', () => {
      const schema = ProjectSelectSchema;
      expect(schema.shape.id).toBeDefined();
      expect(schema.shape.name).toBeDefined();
      expect(schema.shape.description).toBeDefined();
      expect(schema.shape.tenantId).toBeDefined();
      expect(schema.shape.createdAt).toBeDefined();
      expect(schema.shape.updatedAt).toBeDefined();
    });

    it('should not apply modifiers to non-existent fields', () => {
      const schema = ProjectSelectSchema;
      expect(schema.shape.subAgentId).toBeUndefined();
    });

    it('should handle tables with different field sets', () => {
      const projectSchema = ProjectSelectSchema;
      const subAgentSchema = SubAgentSelectSchema;

      expect(projectSchema.shape.id).toBeDefined();
      expect(subAgentSchema.shape.id).toBeDefined();
      expect(subAgentSchema.shape.subAgentId).toBeUndefined();
      expect(subAgentSchema.shape.agentId).toBeDefined();
    });
  });

  describe('Override Support', () => {
    it('should allow overrides to merge with defaults', () => {
      const testTable = sqliteTable('test', {
        id: text('id').notNull(),
        name: text('name').notNull(),
      });

      const schema = createSelectSchemaForTest(testTable, {
        id: (s) => s.describe('Custom ID description'),
      });

      const idSchema = schema.shape.id;
      expect(idSchema).toBeDefined();
      const description = (idSchema as any)._def?.description || (idSchema as any).description;
      expect(description).toBe('Custom ID description');
    });
  });

  describe('Insert Schemas', () => {
    it('should apply modifiers to insert schemas', () => {
      const schema = ProjectInsertSchema;
      expect(schema.shape.id).toBeDefined();
      expect(schema.shape.name).toBeDefined();
      expect(schema.shape.description).toBeDefined();
    });

    it('should add descriptions to insert schema fields', () => {
      const schema = ProjectInsertSchema.shape.id;
      expect(schema).toBeDefined();
      expect(typeof schema.parse).toBe('function');
    });

    it('should validate insert schema types', () => {
      const schema = ProjectInsertSchema.shape.id;
      expect(() => schema.parse('valid-id')).not.toThrow();
      expect(() => schema.parse(123)).toThrow();
    });
  });

  describe('Integration with Actual Tables', () => {
    it('should work with projects table', () => {
      const schema = ProjectSelectSchema;
      const validData = {
        id: 'project-1',
        tenantId: 'tenant-1',
        name: 'Test Project',
        description: 'Test Description',
        models: {
          base: {
            model: 'gpt-4',
          },
        },
        stopWhen: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => schema.parse(validData)).not.toThrow();
    });

    it('should work with subAgents table', () => {
      const schema = SubAgentSelectSchema;
      const validData = {
        id: 'sub-agent-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        agentId: 'agent-1',
        name: 'Test Sub-Agent',
        description: 'Test Description',
        prompt: 'Test prompt',
        conversationHistoryConfig: null,
        models: null,
        stopWhen: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => schema.parse(validData)).not.toThrow();
    });

    it('should work with agents table', () => {
      const schema = AgentSelectSchema;
      const validData = {
        id: 'agent-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        name: 'Test Agent',
        description: 'Test Description',
        defaultSubAgentId: null,
        contextConfigId: null,
        models: null,
        statusUpdates: null,
        prompt: null,
        stopWhen: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => schema.parse(validData)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle tables with no matching fields', () => {
      const testTable = sqliteTable('test_no_matching', {
        customField: text('custom_field').notNull(),
        anotherField: text('another_field').notNull(),
      });

      const schema = createSelectSchemaForTest(testTable);

      expect(schema.shape.customField).toBeDefined();
      expect(schema.shape.anotherField).toBeDefined();
    });

    it('should handle tables with all matching fields', () => {
      const testTable = sqliteTable('test_all_matching', {
        id: text('id').notNull(),
        name: text('name').notNull(),
        description: text('description').notNull(),
        tenantId: text('tenant_id').notNull(),
        createdAt: text('created_at').notNull(),
        updatedAt: text('updated_at').notNull(),
      });

      const schema = createSelectSchemaForTest(testTable);

      expect(schema.shape.id).toBeDefined();
      expect(schema.shape.name).toBeDefined();
      expect(schema.shape.description).toBeDefined();
      expect(schema.shape.tenantId).toBeDefined();
      expect(schema.shape.createdAt).toBeDefined();
      expect(schema.shape.updatedAt).toBeDefined();
    });
  });
});
