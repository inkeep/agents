import { z } from '@hono/zod-openapi';
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
 * Strips JSON Schema numeric constraints that are not supported by all LLM providers.
 *
 * Anthropic structured output rejects `minimum`, `maximum`, `exclusiveMinimum`,
 * `exclusiveMaximum`, and `multipleOf` on `number`/`integer` types.
 * Applied recursively to handle nested objects and arrays.
 */
export function stripUnsupportedConstraints<T extends Record<string, unknown> | null | undefined>(
  schema: T
): T {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const stripped: any = { ...schema };

  if (stripped.type === 'number' || stripped.type === 'integer') {
    delete stripped.minimum;
    delete stripped.maximum;
    delete stripped.exclusiveMinimum;
    delete stripped.exclusiveMaximum;
    delete stripped.multipleOf;
  }

  if (stripped.properties && typeof stripped.properties === 'object') {
    const strippedProperties: any = {};
    for (const [key, value] of Object.entries(stripped.properties)) {
      strippedProperties[key] = stripUnsupportedConstraints(value as Record<string, unknown>);
    }
    stripped.properties = strippedProperties;
  }

  if (stripped.items) {
    stripped.items = stripUnsupportedConstraints(stripped.items as Record<string, unknown>);
  }
  if (Array.isArray(stripped.anyOf)) {
    stripped.anyOf = stripped.anyOf.map((s: any) =>
      stripUnsupportedConstraints(s as Record<string, unknown>)
    );
  }
  if (Array.isArray(stripped.oneOf)) {
    stripped.oneOf = stripped.oneOf.map((s: any) =>
      stripUnsupportedConstraints(s as Record<string, unknown>)
    );
  }
  if (Array.isArray(stripped.allOf)) {
    stripped.allOf = stripped.allOf.map((s: any) =>
      stripUnsupportedConstraints(s as Record<string, unknown>)
    );
  }

  return stripped;
}

/**
 * Makes all properties required in an object schema, wrapping originally-optional
 * fields as `{ anyOf: [<schema>, { type: 'null' }] }`.
 *
 * OpenAI strict-mode structured output requires every key in `properties` to also
 * appear in `required`. Applied recursively to handle nested objects and arrays.
 */
export function makeAllPropertiesRequired<T extends Record<string, unknown> | null | undefined>(
  schema: T
): T {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const normalized: any = { ...schema };

  if (normalized.properties && typeof normalized.properties === 'object') {
    const originalRequired: string[] = Array.isArray(normalized.required)
      ? normalized.required
      : [];
    normalized.required = Object.keys(normalized.properties);

    const normalizedProperties: any = {};
    for (const [key, value] of Object.entries(normalized.properties)) {
      const prop = value as Record<string, unknown>;
      const processed = makeAllPropertiesRequired(prop);
      const alreadyNullable =
        (Array.isArray(processed.anyOf) &&
          (processed.anyOf as any[]).some((s: any) => s?.type === 'null')) ||
        processed.nullable === true;
      normalizedProperties[key] =
        originalRequired.includes(key) || alreadyNullable
          ? processed
          : { anyOf: [processed, { type: 'null' }] };
    }
    normalized.properties = normalizedProperties;
  }

  if (normalized.items) {
    normalized.items = makeAllPropertiesRequired(normalized.items as Record<string, unknown>);
  }
  if (Array.isArray(normalized.anyOf)) {
    normalized.anyOf = normalized.anyOf.map((s: any) =>
      makeAllPropertiesRequired(s as Record<string, unknown>)
    );
  }
  if (Array.isArray(normalized.oneOf)) {
    normalized.oneOf = normalized.oneOf.map((s: any) =>
      makeAllPropertiesRequired(s as Record<string, unknown>)
    );
  }
  if (Array.isArray(normalized.allOf)) {
    normalized.allOf = normalized.allOf.map((s: any) =>
      makeAllPropertiesRequired(s as Record<string, unknown>)
    );
  }

  return normalized;
}

/**
 * Normalizes a data component JSON Schema for cross-provider LLM compatibility.
 *
 * Applies two transformations in order:
 * 1. `stripUnsupportedConstraints` — removes `minimum`/`maximum`/etc. from numbers
 *    (Anthropic structured output rejects these)
 * 2. `makeAllPropertiesRequired` — ensures every property appears in `required`,
 *    wrapping optional fields as nullable (OpenAI strict-mode requires this)
 */
export function normalizeDataComponentSchema<T extends Record<string, unknown> | null | undefined>(
  schema: T
): T {
  return makeAllPropertiesRequired(stripUnsupportedConstraints(schema));
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
