import { z } from '@hono/zod-openapi';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  createInsertSchema as drizzleCreateInsertSchema,
  createSelectSchema as drizzleCreateSelectSchema,
} from 'drizzle-zod';

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

export const resourceIdSchema = z
  .string()
  .min(MIN_ID_LENGTH)
  .max(MAX_ID_LENGTH)
  .describe('Resource identifier')
  .regex(URL_SAFE_ID_PATTERN, {
    message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
  })
  .openapi({
    description: 'Resource identifier',
    example: 'resource_789',
  });

resourceIdSchema.meta({
  description: 'Resource identifier',
});

const FIELD_MODIFIERS: Record<string, (schema: z.ZodTypeAny) => z.ZodTypeAny> = {
  id: (schema) => {
    const modified = (schema as z.ZodString)
      .min(MIN_ID_LENGTH)
      .max(MAX_ID_LENGTH)
      .describe('Resource identifier')
      .regex(URL_SAFE_ID_PATTERN, {
        message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
      })
      .openapi({
        description: 'Resource identifier',
        example: 'resource_789',
      });
    modified.meta({
      description: 'Resource identifier',
    });
    return modified;
  },
  name: (_schema) => {
    const modified = z.string().describe('Name');
    modified.meta({ description: 'Name' });
    return modified;
  },
  description: (_schema) => {
    const modified = z.string().describe('Description');
    modified.meta({ description: 'Description' });
    return modified;
  },
  tenantId: (schema) => {
    const modified = schema.describe('Tenant identifier');
    modified.meta({ description: 'Tenant identifier' });
    return modified;
  },
  projectId: (schema) => {
    const modified = schema.describe('Project identifier');
    modified.meta({ description: 'Project identifier' });
    return modified;
  },
  agentId: (schema) => {
    const modified = schema.describe('Agent identifier');
    modified.meta({ description: 'Agent identifier' });
    return modified;
  },
  subAgentId: (schema) => {
    const modified = schema.describe('Sub-agent identifier');
    modified.meta({ description: 'Sub-agent identifier' });
    return modified;
  },
  createdAt: (schema) => {
    const modified = schema.describe('Creation timestamp');
    modified.meta({ description: 'Creation timestamp' });
    return modified;
  },
  updatedAt: (schema) => {
    const modified = schema.describe('Last update timestamp');
    modified.meta({ description: 'Last update timestamp' });
    return modified;
  },
};

function createSelectSchemaWithModifiers<T extends AnySQLiteTable>(
  table: T,
  overrides?: Partial<Record<keyof T['_']['columns'], (schema: z.ZodTypeAny) => z.ZodTypeAny>>
) {
  const tableColumns = table._?.columns;
  if (!tableColumns) {
    return drizzleCreateSelectSchema(table, overrides as any);
  }

  const tableFieldNames = Object.keys(tableColumns) as Array<keyof typeof tableColumns>;

  const modifiers: Record<string, (schema: z.ZodTypeAny) => z.ZodTypeAny> = {};

  for (const fieldName of tableFieldNames) {
    const fieldNameStr = String(fieldName);
    if (fieldNameStr in FIELD_MODIFIERS) {
      modifiers[fieldNameStr] = FIELD_MODIFIERS[fieldNameStr];
    }
  }

  const mergedModifiers = { ...modifiers, ...overrides } as any;

  return drizzleCreateSelectSchema(table, mergedModifiers);
}

function createInsertSchemaWithModifiers<T extends AnySQLiteTable>(
  table: T,
  overrides?: Partial<Record<keyof T['_']['columns'], (schema: z.ZodTypeAny) => z.ZodTypeAny>>
) {
  const tableColumns = table._?.columns;
  if (!tableColumns) {
    return drizzleCreateInsertSchema(table, overrides as any);
  }

  const tableFieldNames = Object.keys(tableColumns) as Array<keyof typeof tableColumns>;

  const modifiers: Record<string, (schema: z.ZodTypeAny) => z.ZodTypeAny> = {};

  for (const fieldName of tableFieldNames) {
    const fieldNameStr = String(fieldName);
    if (fieldNameStr in FIELD_MODIFIERS) {
      modifiers[fieldNameStr] = FIELD_MODIFIERS[fieldNameStr];
    }
  }

  const mergedModifiers = { ...modifiers, ...overrides } as any;

  return drizzleCreateInsertSchema(table, mergedModifiers);
}

export const createSelectSchema = createSelectSchemaWithModifiers;
export const createInsertSchema = createInsertSchemaWithModifiers;

/**
 * Helper function to register a schema in the global registry using .meta() and return it.
 * This ensures metadata persists through transformations.
 */
function registerSchema<T extends z.ZodTypeAny>(
  schema: T,
  metadata: {
    description?: string;
    id?: string;
    title?: string;
    deprecated?: boolean;
    [key: string]: unknown;
  }
): T {
  (schema as any).meta(metadata);
  return schema;
}

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

/**
 * Wrapper for .partial() that registers the resulting schema and its fields in the global registry.
 * This function ensures that field schemas are properly registered and configured with OpenAPI metadata.
 */
export function partialWithRegistry<T extends z.ZodObject<any>>(
  schema: T,
  metadata?: { description?: string; [key: string]: unknown }
): T {
  const partialSchema = schema.partial() as T;

  // Register field schemas - this registers them in the global registry
  registerFieldSchemas(partialSchema);

  // Reconstruct schema shape with properly configured field schemas
  const shape = partialSchema.shape;
  const newShape: Record<string, z.ZodTypeAny> = {};

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
    let configuredSchema = fieldSchema as z.ZodTypeAny;

    if (fieldName in fieldMetadata) {
      let innerSchema: z.ZodTypeAny;
      const isOptional = configuredSchema instanceof z.ZodOptional;

      if (isOptional) {
        innerSchema = (configuredSchema as z.ZodOptional<any>)._def.innerType as z.ZodTypeAny;
      } else {
        innerSchema = configuredSchema;
      }

      // Handle id field specially - ensure it has full validation
      if (fieldName === 'id' && innerSchema instanceof z.ZodString) {
        const configuredId = innerSchema
          .min(MIN_ID_LENGTH)
          .max(MAX_ID_LENGTH)
          .describe('Resource identifier')
          .regex(URL_SAFE_ID_PATTERN, {
            message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
          })
          .openapi({
            description: 'Resource identifier',
            minLength: MIN_ID_LENGTH,
            maxLength: MAX_ID_LENGTH,
            pattern: URL_SAFE_ID_PATTERN.source,
            example: 'resource_789',
          });

        configuredId.meta({ description: 'Resource identifier' });
        configuredSchema = isOptional ? configuredId.optional() : configuredId;
      } else if (innerSchema instanceof z.ZodString) {
        // For other string fields, ensure description is set
        const configuredField = innerSchema.describe(fieldMetadata[fieldName].description).openapi({
          description: fieldMetadata[fieldName].description,
        });

        configuredField.meta(fieldMetadata[fieldName]);
        configuredSchema = isOptional ? configuredField.optional() : configuredField;
      }
    }

    newShape[fieldName] = configuredSchema;
  }

  // Reconstruct schema with properly configured fields
  const reconstructedSchema = partialSchema.extend(newShape).partial() as T;
  registerFieldSchemas(reconstructedSchema);

  if (metadata) {
    registerSchema(reconstructedSchema, metadata);
  }

  return reconstructedSchema;
}

/**
 * Wrapper for .omit() that registers the resulting schema and its fields in the global registry
 */
export function omitWithRegistry<T extends z.ZodObject<any>>(
  schema: T,
  keys: z.ZodObject<any>['shape'],
  metadata?: { description?: string; [key: string]: unknown }
): T {
  const omittedSchema = schema.omit(keys) as T;
  registerFieldSchemas(omittedSchema);
  if (metadata) {
    registerSchema(omittedSchema, metadata);
  }
  return omittedSchema;
}

/**
 * Wrapper for .extend() that registers the resulting schema and its fields in the global registry
 */
export function extendWithRegistry<T extends z.ZodObject<any>>(
  schema: T,
  shape: z.ZodRawShape,
  metadata?: { description?: string; [key: string]: unknown }
): T {
  const extendedSchema = schema.extend(shape) as T;
  registerFieldSchemas(extendedSchema);
  if (metadata) {
    registerSchema(extendedSchema, metadata);
  }
  return extendedSchema;
}
