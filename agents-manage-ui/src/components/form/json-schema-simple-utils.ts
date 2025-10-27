import type { RJSFSchema } from '@rjsf/utils';

export type SimpleJsonSchemaPrimitiveType = 'string' | 'number' | 'integer' | 'boolean';

export type SimpleJsonSchemaType = SimpleJsonSchemaPrimitiveType | 'object' | 'array';

export interface SimpleJsonSchemaProperty {
  name: string;
  title?: string;
  description?: string;
  type: SimpleJsonSchemaType;
  required?: boolean;
  properties?: SimpleJsonSchemaProperty[];
  items?: SimpleJsonSchemaProperty | null;
}

export interface SimpleJsonSchema {
  title?: string;
  description?: string;
  properties: SimpleJsonSchemaProperty[];
}

export const createEmptySimpleJsonSchema = (): SimpleJsonSchema => ({
  title: '',
  description: '',
  properties: [],
});

export const isSimpleJsonSchemaEmpty = (schema: SimpleJsonSchema): boolean => {
  if (schema.title?.trim()) return false;
  if (schema.description?.trim()) return false;
  return schema.properties.length === 0;
};

interface JsonToSimpleResult {
  simpleSchema: SimpleJsonSchema;
  error?: string;
}

type JsonSchemaInput = unknown;

const SUPPORTED_PRIMITIVES: SimpleJsonSchemaPrimitiveType[] = [
  'string',
  'number',
  'integer',
  'boolean',
];

const ensurePropertyName = (name?: string): string => {
  if (name && name.trim().length > 0) return name;
  return 'item';
};

const normalizeDescription = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const normalizeTitle = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const buildPropertiesFromSimple = (properties: SimpleJsonSchemaProperty[]): {
  properties: Record<string, RJSFSchema>;
  required: string[];
} => {
  const result: Record<string, RJSFSchema> = {};
  const required: string[] = [];

  for (const property of properties) {
    const name = property.name?.trim();
    if (!name) continue;

    const schema = buildSchemaForProperty(property);
    if (!schema) continue;

    result[name] = schema;
    if (property.required) {
      required.push(name);
    }
  }

  return { properties: result, required };
};

const buildSchemaForProperty = (property: SimpleJsonSchemaProperty): RJSFSchema | null => {
  const { type } = property;

  if (!type) return null;

  const base: RJSFSchema = {};

  const title = normalizeTitle(property.title);
  if (title) base.title = title;

  const description = normalizeDescription(property.description);
  if (description) base.description = description;

  if (SUPPORTED_PRIMITIVES.includes(type as SimpleJsonSchemaPrimitiveType)) {
    base.type = type;
    return base;
  }

  if (type === 'object') {
    base.type = 'object';

    const nested = buildPropertiesFromSimple(property.properties ?? []);
    base.properties = nested.properties;
    if (nested.required.length > 0) {
      base.required = nested.required;
    }

    return base;
  }

  if (type === 'array') {
    base.type = 'array';

    if (property.items) {
      const itemSchema = buildSchemaForProperty({
        ...property.items,
        name: ensurePropertyName(property.items.name),
      });
      if (itemSchema) {
        base.items = itemSchema;
        return base;
      }
    }

    // Default to string array if no item definition provided.
    base.items = { type: 'string' };
    return base;
  }

  return null;
};

export const convertSimpleToJsonSchema = (
  simpleSchema: SimpleJsonSchema
): RJSFSchema | null => {
  const { properties, required } = buildPropertiesFromSimple(simpleSchema.properties);

  if (
    Object.keys(properties).length === 0 &&
    !simpleSchema.title?.trim() &&
    !simpleSchema.description?.trim()
  ) {
    return null;
  }

  const schema: RJSFSchema = {
    type: 'object',
    properties,
  };

  const title = normalizeTitle(simpleSchema.title);
  if (title) schema.title = title;

  const description = normalizeDescription(simpleSchema.description);
  if (description) schema.description = description;

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
};

const convertJsonPropertyToSimple = (
  name: string,
  propertySchema: RJSFSchema,
  required: boolean
): { property?: SimpleJsonSchemaProperty; error?: string } => {
  const propertyType = propertySchema?.type;

  if (typeof propertyType === 'string') {
    if (SUPPORTED_PRIMITIVES.includes(propertyType as SimpleJsonSchemaPrimitiveType)) {
      return {
        property: {
          name,
          type: propertyType as SimpleJsonSchemaPrimitiveType,
          title: normalizeTitle(propertySchema.title),
          description: normalizeDescription(propertySchema.description),
          required,
        },
      };
    }

    if (propertyType === 'object') {
      const nested = convertJsonPropertiesToSimple(
        propertySchema.properties,
        new Set(Array.isArray(propertySchema.required) ? propertySchema.required : [])
      );

      return {
        property: {
          name,
          type: 'object',
          title: normalizeTitle(propertySchema.title),
          description: normalizeDescription(propertySchema.description),
          required,
          properties: nested.properties,
        },
        error: nested.error,
      };
    }

    if (propertyType === 'array') {
      let items: SimpleJsonSchemaProperty | null = null;
      let error: string | undefined;

      if (Array.isArray(propertySchema.items)) {
        return {
          property: {
            name,
            type: 'array',
            title: normalizeTitle(propertySchema.title),
            description: normalizeDescription(propertySchema.description),
            required,
          },
          error: `Tuple array schemas are not supported in the simple editor (property "${name}")`,
        };
      }

      if (propertySchema.items && typeof propertySchema.items === 'object') {
        const itemConversion = convertJsonPropertyToSimple(
          ensurePropertyName(propertySchema.items.title as string),
          propertySchema.items as RJSFSchema,
          false
        );
        items = itemConversion.property ?? null;
        error = itemConversion.error;
      }

      return {
        property: {
          name,
          type: 'array',
          title: normalizeTitle(propertySchema.title),
          description: normalizeDescription(propertySchema.description),
          required,
          items,
        },
        error,
      };
    }
  }

  return {
    error: `Unsupported schema type for property "${name}"`,
  };
};

const convertJsonPropertiesToSimple = (
  properties: JsonSchemaInput,
  requiredSet: Set<string>
): { properties: SimpleJsonSchemaProperty[]; error?: string } => {
  if (!properties || typeof properties !== 'object') {
    return { properties: [] };
  }

  const result: SimpleJsonSchemaProperty[] = [];
  let error: string | undefined;

  for (const [name, schema] of Object.entries(properties as Record<string, RJSFSchema>)) {
    const conversion = convertJsonPropertyToSimple(name, schema, requiredSet.has(name));
    if (conversion.property) {
      result.push(conversion.property);
    }
    if (!error && conversion.error) {
      error = conversion.error;
    }
  }

  return { properties: result, error };
};

export const convertJsonSchemaToSimple = (schema: JsonSchemaInput): JsonToSimpleResult => {
  const empty = createEmptySimpleJsonSchema();

  if (!schema || typeof schema !== 'object') {
    return {
      simpleSchema: empty,
      error: 'Schema could not be parsed. Falling back to an empty template.',
    };
  }

  const typedSchema = schema as RJSFSchema;
  const type = typedSchema.type;

  if (type && type !== 'object') {
    return {
      simpleSchema: empty,
      error: 'Only object schemas are supported in the simple editor. Please use Advanced mode.',
    };
  }

  const requiredSet = new Set<string>(
    Array.isArray(typedSchema.required) ? typedSchema.required : []
  );

  const conversion = convertJsonPropertiesToSimple(typedSchema.properties, requiredSet);

  return {
    simpleSchema: {
      title: normalizeTitle(typedSchema.title) ?? '',
      description: normalizeDescription(typedSchema.description) ?? '',
      properties: conversion.properties,
    },
    error: conversion.error,
  };
};
