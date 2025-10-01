import { z } from 'zod';
import { getLogger } from './logger';

const logger = getLogger('schema-utils');

/**
 * Utility function for converting Zod schemas to JSON Schema
 * Used by both request context schemas and component schemas
 */
export function convertZodToJsonSchema(zodSchema: any): Record<string, unknown> {
  try {
    return z.toJSONSchema(zodSchema, { target: 'draft-7' });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        zodSchema: typeof zodSchema,
      },
      'Failed to convert Zod schema to JSON Schema'
    );
    
    // Return a fallback schema
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
  }
}