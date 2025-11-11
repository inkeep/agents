import { z } from 'zod';

/**
 * Converts JSON Schema objects to Zod schema types
 * Supports: object, array, string, number, integer, boolean, null, enum, required fields
 */
export function jsonSchemaToZod(jsonSchema: any): z.ZodType<any> {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.unknown();
  }

  switch (jsonSchema.type) {
    case 'object':
      if (jsonSchema.properties) {
        const shape: Record<string, z.ZodType<any>> = {};
        for (const [key, prop] of Object.entries(jsonSchema.properties)) {
          let zodType = jsonSchemaToZod(prop);

          // Handle optional fields
          if (!jsonSchema.required?.includes(key)) {
            zodType = zodType.optional();
          }

          shape[key] = zodType;
        }
        return z.object(shape);
      }
      return z.record(z.string(), z.unknown());

    case 'array': {
      const itemSchema = jsonSchema.items ? jsonSchemaToZod(jsonSchema.items) : z.unknown();
      return z.array(itemSchema);
    }

    case 'string':
      if (jsonSchema.enum && Array.isArray(jsonSchema.enum) && jsonSchema.enum.length > 0) {
        const [first, ...rest] = jsonSchema.enum;
        return z.enum([first, ...rest]);
      }
      return z.string();

    case 'number':
    case 'integer':
      return z.number();

    case 'boolean':
      return z.boolean();

    case 'null':
      return z.null();

    default:
      return z.unknown();
  }
}

