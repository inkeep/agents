import { z } from '@hono/zod-openapi';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  createInsertSchema as drizzleCreateInsertSchema,
  createSelectSchema as drizzleCreateSelectSchema,
} from 'drizzle-zod';
import { MAX_ID_LENGTH, MIN_ID_LENGTH, URL_SAFE_ID_PATTERN } from '../validation';

function createSelectSchemaWithModifiers<T extends AnySQLiteTable>(
  table: T,
  overrides?: Partial<Record<keyof T['_']['columns'], (schema: z.ZodTypeAny) => z.ZodTypeAny>>
) {
  const tableColumns = table._?.columns;
  if (!tableColumns) {
    return drizzleCreateSelectSchema(table, overrides as any);
  }
  throw new Error('Unexpected "tableColumns" is defined');
}

function createInsertSchemaWithModifiers<T extends AnySQLiteTable>(
  table: T,
  overrides?: Partial<Record<keyof T['_']['columns'], (schema: z.ZodTypeAny) => z.ZodTypeAny>>
) {
  const tableColumns = table._?.columns;
  if (!tableColumns) {
    return drizzleCreateInsertSchema(table, overrides as any);
  }
  throw new Error('Unexpected "tableColumns" is defined');
}

export const createSelectSchema = createSelectSchemaWithModifiers;
export const createInsertSchema = createInsertSchemaWithModifiers;

/**
 * Registers all field schemas in an object schema that match known field names.
 * This ensures metadata persists through transformations like .partial() and .omit().
 * For the 'id' field, also applies full validation constraints via .openapi().
 *
 * This function registers each field schema instance in the global registry using .meta(),
 * and ensures OpenAPI metadata is set via .openapi() for proper documentation generation.
 *
 * Note: This modifies the schemas in place by registering them in the global registry.
 * The schema shape itself is not modified, but the field schemas are registered.
 */
export function registerFieldSchemas<T extends z.ZodObject<any>>(schema: T): T {
  if (!(schema instanceof z.ZodObject)) {
    return schema;
  }

  const shape = schema.shape;
  const fieldMetadata: Record<string, { description: string }> = {
    id: { description: 'Resource identifier' },
    name: { description: 'Name' },
    description: { description: 'Description' },
    tenantId: { description: 'Tenant identifier' },
    projectId: { description: 'Project identifier' },
    agentId: { description: 'Agent identifier' },
    subAgentId: { description: 'Sub-agent identifier' },
    createdAt: { description: 'Creation timestamp' },
    updatedAt: { description: 'Last update timestamp' },
  };

  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    if (fieldName in fieldMetadata && fieldSchema) {
      let zodFieldSchema = fieldSchema as z.ZodTypeAny;
      let innerSchema: z.ZodTypeAny | null = null;

      // Unwrap ZodOptional to get the inner schema
      if (zodFieldSchema instanceof z.ZodOptional) {
        innerSchema = zodFieldSchema._def.innerType as z.ZodTypeAny;
        zodFieldSchema = innerSchema;
      }

      // Register in global registry using .meta()
      zodFieldSchema.meta(fieldMetadata[fieldName]);

      // Special handling for 'id' field - ensure it has full validation via .openapi()
      if (fieldName === 'id' && zodFieldSchema instanceof z.ZodString) {
        // Always ensure OpenAPI metadata is set for id field
        zodFieldSchema.openapi({
          description: 'Resource identifier',
          minLength: MIN_ID_LENGTH,
          maxLength: MAX_ID_LENGTH,
          pattern: URL_SAFE_ID_PATTERN.source,
          example: 'resource_789',
        });
      } else if (zodFieldSchema instanceof z.ZodString) {
        // For other string fields, ensure description is set via .openapi()
        zodFieldSchema.openapi({
          description: fieldMetadata[fieldName].description,
        });
      }

      // Also register the optional wrapper if it exists
      if (innerSchema && fieldSchema instanceof z.ZodOptional) {
        (fieldSchema as any).meta(fieldMetadata[fieldName]);
      }
    }
  }

  return schema;
}
