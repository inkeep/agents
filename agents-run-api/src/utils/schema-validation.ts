import Ajv from 'ajv';
import { z } from 'zod';
import { convertZodToJsonSchemaWithPreview, extractPreviewFields } from '@inkeep/agents-core/utils/schema-conversion';
import { getLogger } from '../logger';

const logger = getLogger('SchemaValidation');
const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Extended JSON Schema that includes preview field indicators
 */
export interface ExtendedJsonSchema {
  type: string;
  properties?: Record<string, ExtendedJsonSchemaProperty>;
  required?: string[];
  [key: string]: any;
}

export interface ExtendedJsonSchemaProperty {
  type: string;
  description?: string;
  isPreview?: boolean; // New field to indicate if this should be shown in preview
  [key: string]: any;
}

/**
 * Validate that a schema is valid (either JSON Schema or Zod)
 * Following the same pattern as context validation
 */
export function validateComponentSchema(schema: any, componentName: string): { 
  isValid: boolean; 
  error?: string;
  validatedSchema?: ExtendedJsonSchema;
} {
  try {
    // Check if it's a Zod schema
    if (schema instanceof z.ZodType) {
      // Convert Zod to JSON Schema with preview metadata
      const jsonSchema = convertZodToJsonSchemaWithPreview(schema);
      return {
        isValid: true,
        validatedSchema: jsonSchema as ExtendedJsonSchema
      };
    }
    
    // Check if it's a JSON Schema
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return { 
        isValid: false, 
        error: 'Schema must be a valid JSON Schema object or Zod schema' 
      };
    }

    // Basic JSON Schema validation - just check it compiles with AJV
    ajv.compile(schema);
    
    // If it compiled successfully, it's a valid JSON Schema
    return { 
      isValid: true, 
      validatedSchema: schema as ExtendedJsonSchema 
    };
    
  } catch (error) {
    logger.error({ 
      componentName, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 'Invalid component schema');
    
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Invalid JSON Schema' 
    };
  }
}

/**
 * Extract preview fields from a schema (fields marked with isPreview: true)
 */
export function extractPreviewFields(schema: ExtendedJsonSchema): Record<string, any> {
  const previewProperties: Record<string, any> = {};
  
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.isPreview === true) {
        // Remove the isPreview flag for the extracted schema
        const cleanProp = { ...prop };
        delete cleanProp.isPreview;
        previewProperties[key] = cleanProp;
      }
    }
  }
  
  return {
    type: 'object',
    properties: previewProperties,
    required: schema.required?.filter(field => previewProperties[field])
  };
}

/**
 * Extract full fields from a schema (all fields, with isPreview flags removed)
 */
export function extractFullFields(schema: ExtendedJsonSchema): Record<string, any> {
  const fullProperties: Record<string, any> = {};
  
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      // Remove the isPreview flag for the extracted schema
      const cleanProp = { ...prop };
      delete cleanProp.isPreview;
      fullProperties[key] = cleanProp;
    }
  }
  
  return {
    type: 'object',
    properties: fullProperties,
    required: schema.required
  };
}