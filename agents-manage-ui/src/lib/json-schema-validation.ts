import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { z } from 'zod';

// TypeBox schema for valid JSON Schema Draft 7
const JsonSchemaPropertySchema = Type.Object({
  type: Type.Union([
    Type.Literal('string'),
    Type.Literal('number'),
    Type.Literal('integer'),
    Type.Literal('boolean'),
    Type.Literal('array'),
    Type.Literal('object'),
    Type.Literal('null'),
  ]),
  description: Type.String({ minLength: 1 }),
  // Optional properties that can be present in JSON Schema
  format: Type.Optional(Type.String()),
  pattern: Type.Optional(Type.String()),
  minimum: Type.Optional(Type.Number()),
  maximum: Type.Optional(Type.Number()),
  minLength: Type.Optional(Type.Number()),
  maxLength: Type.Optional(Type.Number()),
  items: Type.Optional(Type.Any()),
  properties: Type.Optional(Type.Any()),
  enum: Type.Optional(Type.Array(Type.Any())),
  const: Type.Optional(Type.Any()),
  default: Type.Optional(Type.Any()),
});

const JsonSchemaObjectSchema = Type.Object({
  type: Type.Literal('object'),
  properties: Type.Record(Type.String(), JsonSchemaPropertySchema),
  required: Type.Array(Type.String(), { minItems: 1 }),
  // Optional object properties
  additionalProperties: Type.Optional(Type.Boolean()),
  description: Type.Optional(Type.String()),
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
 * Validates JSON string for syntax errors
 */
function validateJsonSyntax(jsonString: string): {
  parsed: any;
  errors: ValidationError[];
} {
  const errors: ValidationError[] = [];
  let parsed: any = null;

  if (!jsonString?.trim()) {
    return { parsed: null, errors };
  }

  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    errors.push({
      path: 'root',
      message: error instanceof Error ? error.message : 'Invalid JSON syntax',
      type: 'syntax',
    });
  }

  return { parsed, errors };
}

/**
 * Validates that the JSON represents a valid JSON Schema for LLM usage
 */
function validateJsonSchema(schema: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') {
    errors.push({
      path: 'root',
      message: 'Schema must be an object',
      type: 'schema',
    });
    return errors;
  }

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
function validateLlmRequirements(schema: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  // Ensure all properties in required array exist in properties
  if (schema.required && Array.isArray(schema.required) && schema.properties) {
    schema.required.forEach((requiredProp: string) => {
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
export function validateJsonSchemaForLlm(jsonString: string): ValidationResult {
  const warnings: string[] = [];

  const { parsed, errors: syntaxErrors } = validateJsonSyntax(jsonString);

  if (syntaxErrors.length > 0) {
    return {
      isValid: false,
      errors: syntaxErrors,
      warnings,
    };
  }

  if (!parsed) {
    return {
      isValid: true,
      errors: [],
      warnings: ['Empty schema provided'],
    };
  }

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

export function getJsonParseError(error: unknown): string {
  if (error instanceof SyntaxError) {
    const message = error.message.toLowerCase();
    if (message.includes('unexpected end of json input')) {
      return 'Incomplete JSON - missing closing brackets or quotes';
    }
    if (message.includes('unexpected token')) {
      return 'Invalid character in JSON - check for missing commas, quotes, or brackets';
    }
    if (
      message.includes('expected property name') ||
      message.includes("expected ':' after property name")
    ) {
      return 'Property names must be in double quotes';
    }
    if (message.includes('duplicate keys')) {
      return 'Duplicate property names are not allowed';
    }
    return 'Invalid JSON syntax - check structure and formatting';
  }
  return 'Unable to parse JSON';
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
