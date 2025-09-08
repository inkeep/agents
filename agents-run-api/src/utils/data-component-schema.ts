import { z } from 'zod';
import { getLogger } from '../logger';

const logger = getLogger('DataComponentSchema');

/**
 * Converts JSON Schema objects to Zod schema types
 */
export function jsonSchemaToZod(jsonSchema: any): z.ZodType<any> {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    logger.warn({ jsonSchema }, 'Invalid JSON schema provided, using string fallback');
    return z.string();
  }

  switch (jsonSchema.type) {
    case 'object':
      if (jsonSchema.properties) {
        const shape: Record<string, z.ZodType<any>> = {};
        for (const [key, prop] of Object.entries(jsonSchema.properties)) {
          shape[key] = jsonSchemaToZod(prop);
        }
        return z.object(shape);
      }
      return z.record(z.string(), z.unknown());

    case 'array': {
      const itemSchema = jsonSchema.items ? jsonSchemaToZod(jsonSchema.items) : z.unknown();
      return z.array(itemSchema);
    }

    case 'string':
      return z.string();

    case 'number':
    case 'integer':
      return z.number();

    case 'boolean':
      return z.boolean();

    case 'null':
      return z.null();

    default:
      // Log unsupported types for monitoring
      logger.warn(
        {
          unsupportedType: jsonSchema.type,
          schema: jsonSchema,
        },
        'Unsupported JSON schema type, using unknown validation'
      );
      return z.unknown();
  }
}
