/**
 * Schema Introspection Utilities
 * 
 * Utilities to extract required fields and other metadata from Zod schemas.
 * This ensures CLI generators stay in sync with the actual validation schemas.
 */

import { z } from 'zod';

/**
 * Simple utility to get required fields by attempting validation with empty object
 * and analyzing which fields are reported as missing
 */
function getRequiredFieldsFromValidation(schema: z.ZodType): string[] {
  try {
    // Try to parse an empty object to see what's required
    schema.parse({});
    return []; // If it passes, nothing is required
  } catch (error) {
    if (error instanceof z.ZodError && error.errors) {
      // Extract field names from validation errors
      return error.errors
        .filter(err => err.code === 'invalid_type' && err.expected !== 'undefined')
        .map(err => err.path[0])
        .filter((field): field is string => typeof field === 'string')
        .filter((field, index, arr) => arr.indexOf(field) === index); // Remove duplicates
    }
    return [];
  }
}

/**
 * Extract required field names from a Zod object schema
 */
export function getRequiredFields(schema: z.ZodType): string[] {
  // Use validation-based approach - much simpler and more reliable
  return getRequiredFieldsFromValidation(schema);
}


/**
 * Get a human-readable summary of schema requirements
 */
export function getSchemaInfo(schema: z.ZodType): {
  requiredFields: string[];
  optionalFields: string[];
  allFields: string[];
} {
  const requiredFields = getRequiredFields(schema);
  
  // Get all fields from the shape if available
  let allFields: string[] = [];
  
  if ('shape' in schema && schema.shape) {
    allFields = Object.keys(schema.shape);
  }
  
  const optionalFields = allFields.filter(field => !requiredFields.includes(field));
  
  return { requiredFields, optionalFields, allFields };
}