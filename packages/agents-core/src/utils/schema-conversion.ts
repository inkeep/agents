import { z } from 'zod';
import { getLogger } from './logger';

const logger = getLogger('schema-conversion');

/**
 * Utility function for converting Zod schemas to JSON Schema
 * Moved from ContextConfig.ts to be reusable
 */
export function convertZodToJsonSchema(zodSchema: any): Record<string, unknown> {
  try {
    return z.toJSONSchema(zodSchema, { target: 'draft-7' });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
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
  (schema._def as any).isPreview = true;
  return schema;
};

/**
 * Convert Zod schema to JSON Schema while preserving preview metadata
 */
export function convertZodToJsonSchemaWithPreview(zodSchema: z.ZodTypeAny): Record<string, unknown> {
  // First convert to standard JSON Schema
  const jsonSchema = convertZodToJsonSchema(zodSchema);
  
  // Then enhance with preview metadata for object properties
  if (zodSchema instanceof z.ZodObject && jsonSchema.properties) {
    const shape = zodSchema.shape;
    
    for (const [key, fieldSchema] of Object.entries(shape)) {
      if ((fieldSchema as any)?._def?.isPreview === true) {
        (jsonSchema.properties as any)[key].isPreview = true;
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
      if ((fieldSchema as any)?._def?.isPreview === true) {
        previewFields.push(key);
      }
    }
    return previewFields;
  }
  
  // Handle JSON Schema
  if (schema?.type === 'object' && schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if ((prop as any).isPreview === true) {
        previewFields.push(key);
      }
    }
  }
  
  return previewFields;
}