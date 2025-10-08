import { z } from 'zod';
import { getLogger } from './logger';

const logger = getLogger('schema-conversion');

/**
 * Custom conversion function that produces clean JSON Schema without Zod metadata
 */
function convertZodToCleanJsonSchema(schema: any): Record<string, unknown> {
  // Handle null/undefined schemas
  if (!schema || !schema._def) {
    return { type: 'string' };
  }

  const def = schema._def;

  // Handle different Zod schema types
  switch (def.type) {
    case 'object': {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      if (def.shape) {
        for (const [key, value] of Object.entries(def.shape)) {
          properties[key] = convertZodToCleanJsonSchema(value);
          // Check if the field is required (not optional)
          if (!(value as any)._def?.isOptional?.()) {
            required.push(key);
          }
        }
      }

      return {
        type: 'object',
        properties,
        ...(required.length > 0 && { required }),
      };
    }

    case 'string':
      return { type: 'string' };

    case 'number':
      return { type: 'number' };

    case 'boolean':
      return { type: 'boolean' };

    case 'array':
      return {
        type: 'array',
        items: def.element ? convertZodToCleanJsonSchema(def.element) : { type: 'string' },
      };

    case 'literal':
      return { const: def.values?.[0] || def.value };

    case 'optional':
      return def.innerType ? convertZodToCleanJsonSchema(def.innerType) : { type: 'string' };

    case 'nullable':
      return {
        anyOf: [
          def.innerType ? convertZodToCleanJsonSchema(def.innerType) : { type: 'string' },
          { type: 'null' },
        ],
      };

    default:
      // Fallback to basic type
      return { type: 'string' };
  }
}

/**
 * Utility function for converting Zod schemas to JSON Schema
 * Moved from ContextConfig.ts to be reusable
 */
export function convertZodToJsonSchema(zodSchema: any): Record<string, unknown> {
  try {
    // Use a custom conversion instead of z.toJSONSchema to avoid the complex metadata
    return convertZodToCleanJsonSchema(zodSchema);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to convert Zod schema to JSON Schema'
    );
    throw new Error('Failed to convert Zod schema to JSON Schema');
  }
}

/**
 * Simple helper to mark a Zod schema field as a preview field
 * Adds metadata to the schema definition without modifying Zod's core
 */
export const preview = <T extends z.ZodTypeAny>(schema: T): T => {
  // Use type assertion to safely add preview metadata
  (schema._def as any).inPreview = true;
  return schema;
};

/**
 * Convert Zod schema to JSON Schema while preserving preview metadata
 */
export function convertZodToJsonSchemaWithPreview(
  zodSchema: z.ZodTypeAny
): Record<string, unknown> {
  // First convert to standard JSON Schema
  const jsonSchema = convertZodToJsonSchema(zodSchema);

  // Then enhance with preview metadata for object properties
  if (zodSchema instanceof z.ZodObject && jsonSchema.properties) {
    const shape = zodSchema.shape;

    for (const [key, fieldSchema] of Object.entries(shape)) {
      if ((fieldSchema as any)?._def?.inPreview === true) {
        (jsonSchema.properties as any)[key].inPreview = true;
      }
    }
  }

  return jsonSchema;
}

/**
 * Extract preview fields from either JSON Schema or Zod schema
 */
export function extractPreviewFields(schema: any): string[] {
  const previewFields: string[] = [];

  // Handle Zod schema
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    for (const [key, fieldSchema] of Object.entries(shape)) {
      if ((fieldSchema as any)?._def?.inPreview === true) {
        previewFields.push(key);
      }
    }
    return previewFields;
  }

  // Handle JSON Schema
  if (schema?.type === 'object' && schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if ((prop as any).inPreview === true) {
        previewFields.push(key);
      }
    }
  }

  return previewFields;
}
