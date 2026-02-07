import { z } from 'zod';
import type { JSONSchema } from 'zod/v4/core';

// Zod schema for valid JSON Schema Draft 7
const JsonSchemaPropertySchema = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']),
  description: z.string().trim().nonempty(),
  // Optional properties that can be present in JSON Schema
  format: z.string().optional(),
  pattern: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  items: z.unknown().optional(),
  properties: z.unknown().optional(),
  enum: z.array(z.unknown()).optional(),
  const: z.unknown().optional(),
  default: z.unknown().optional(),
});

const JsonSchemaObjectSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), JsonSchemaPropertySchema),
  required: z.array(z.string()).min(1),
  // Optional object properties
  additionalProperties: z.boolean().optional(),
  description: z.string().optional(),
});

// Compile validators for better performance
const propertyValidator = TypeCompiler.Compile(JsonSchemaPropertySchema);
const objectValidator = TypeCompiler.Compile(JsonSchemaObjectSchema);

interface ValidationError {
  path: string;
  message: string;
  type: 'syntax' | 'schema' | 'llm_requirement';
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Validates that the JSON represents a valid JSON Schema for LLM usage
 */
function validateJsonSchema(schema: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!objectValidator.Check(schema)) {
    // Check individual properties for better error messages
    if (!schema.type || schema.type !== 'object') {
      errors.push({
        path: 'type',
        message: 'Schema must have type: "object" for LLM compatibility',
        type: 'llm_requirement',
      });
    }

    if (!schema.properties || typeof schema.properties !== 'object') {
      errors.push({
        path: 'properties',
        message: 'Schema must have a "properties" object',
        type: 'schema',
      });
    }

    if (schema.required && !Array.isArray(schema.required)) {
      errors.push({
        path: 'required',
        message: 'Schema must have a "required" array (can be empty)',
        type: 'llm_requirement',
      });
    }

    if (schema.properties && typeof schema.properties === 'object') {
      Object.entries(schema.properties).forEach(([propertyName, propertySchema]) => {
        if (!propertyValidator.Check(propertySchema)) {
          const propertyErrors = [...propertyValidator.Errors(propertySchema)];

          propertyErrors.forEach((error) => {
            let message = error.message;

            // Custom messages for LLM requirements
            if (error.path === '/description') {
              message = 'Each property must have a "description" for LLM compatibility';
            } else if (error.path === '/type') {
              message = 'Each property must have a valid "type"';
            }

            errors.push({
              path: `properties.${propertyName}${error.path}`,
              message,
              type: error.path === '/description' ? 'llm_requirement' : 'schema',
            });
          });
        }
      });
    }

    return errors;
  }

  return errors;
}

/**
 * Validates additional LLM-specific requirements
 */
function validateLlmRequirements(schema: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  // Ensure all properties in required array exist in properties
  if (schema.required && Array.isArray(schema.required) && schema.properties) {
    schema.required.forEach((requiredProp: string) => {
      // @ts-expect-error -- fixme
      if (!schema.properties[requiredProp]) {
        errors.push({
          path: `required`,
          message: `Required property "${requiredProp}" must exist in properties`,
          type: 'schema',
        });
      }
    });
  }

  // Ensure all properties have descriptions
  if (schema.properties && typeof schema.properties === 'object') {
    Object.entries(schema.properties).forEach(([propertyName, propertySchema]: [string, any]) => {
      if (
        !propertySchema.description ||
        typeof propertySchema.description !== 'string' ||
        propertySchema.description.trim().length === 0
      ) {
        errors.push({
          path: `properties.${propertyName}.description`,
          message: 'Each property must have a non-empty description for LLM compatibility',
          type: 'llm_requirement',
        });
      }
    });
  }

  return errors;
}

/**
 * Comprehensive JSON Schema validation for LLM usage
 */
export function validateJsonSchemaForLlm(parsed: JSONSchema.BaseSchema): ValidationResult {
  const warnings: string[] = [];

  const schemaErrors = validateJsonSchema(parsed);

  const llmErrors = validateLlmRequirements(parsed);

  const allErrors = [...schemaErrors, ...llmErrors];

  // Add warnings for best practices (removed additionalProperties warning)

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings,
  };
}

/**
 * Used in z.transform, later will be reused in reusing zod schema from @inkeep/agents-core PR
 */
export function transformToJson<T extends string>(value: T, ctx: z.RefinementCtx<T>) {
  try {
    return JSON.parse(value);
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid JSON syntax',
    });
    return z.NEVER;
  }
}
