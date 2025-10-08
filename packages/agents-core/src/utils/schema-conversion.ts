import { z } from 'zod';
import { getLogger } from './logger';

const logger = getLogger('schema-conversion');

// Type extension for Zod schemas with preview metadata
interface PreviewZodDef {
  inPreview?: boolean;
}

// Type for Zod schemas that can have preview metadata
type PreviewZodType = z.ZodTypeAny & {
  _def: PreviewZodDef;
};

/**
 * Utility function for converting Zod schemas to JSON Schema
 * Uses Zod's built-in toJSONSchema method
 */
export function convertZodToJsonSchema(zodSchema: any): Record<string, unknown> {
  try {
    // Use Zod's built-in toJSONSchema method
    const jsonSchema = z.toJSONSchema(zodSchema);

    // Remove the $schema field to avoid AJV compatibility issues
    // AJV doesn't recognize the newer JSON Schema draft versions
    if (jsonSchema.$schema) {
      delete jsonSchema.$schema;
    }

    return jsonSchema;
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
  // Use proper type extension to add preview metadata
  (schema as PreviewZodType)._def.inPreview = true;
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
      if ((fieldSchema as PreviewZodType)?._def?.inPreview === true) {
        (jsonSchema.properties as any)[key].inPreview = true;
      }
    }
  }

  return jsonSchema;
}

/**
 * Type guard to check if a value is a Zod schema
 */
export function isZodSchema(value: any): value is z.ZodObject<any> {
  return value?._def?.type === 'object';
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
