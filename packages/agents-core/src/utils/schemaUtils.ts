import { z } from 'zod';

/**
 * Utility function for converting Zod schemas to JSON Schema
 * Used by both request context schemas and component schemas
 */
export function convertZodToJsonSchema(zodSchema: any): Record<string, unknown> {
  try {
    return z.toJSONSchema(zodSchema, { target: 'draft-7' });
  } catch (error) {
    // Return a fallback schema on conversion failure
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
  }
}