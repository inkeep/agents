import { z } from 'zod';

// Conditional logger import for browser compatibility
let logger: any = null;
try {
  // Only import logger in Node.js environment
  if (typeof window === 'undefined') {
    const { getLogger } = require('./logger');
    logger = getLogger('schema-utils');
  }
} catch {
  // Logger not available (browser environment)
}

/**
 * Utility function for converting Zod schemas to JSON Schema
 * Used by both request context schemas and component schemas
 */
export function convertZodToJsonSchema(zodSchema: any): Record<string, unknown> {
  try {
    return z.toJSONSchema(zodSchema, { target: 'draft-7' });
  } catch (error) {
    // Log error only if logger is available (Node.js)
    if (logger) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          zodSchema: typeof zodSchema,
        },
        'Failed to convert Zod schema to JSON Schema'
      );
    } else {
      // Fallback for browser - use console if available
      if (typeof console !== 'undefined') {
        console.error('Failed to convert Zod schema to JSON Schema:', error);
      }
    }
    
    // Return a fallback schema
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
  }
}