import { z } from 'zod';
import type { PinoLogger } from '../logger';

/**
 * Client friendly json schema to zod
 */
export function jsonSchemaToZod(jsonSchema: any, logger?: PinoLogger): z.ZodType<any> {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    logger?.warn({ jsonSchema }, 'Invalid JSON schema provided, using string fallback');
    return z.string();
  }

  const schemaType = jsonSchema.type as string | undefined;

  switch (schemaType) {
    case 'object': {
      const properties = jsonSchema.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (properties && typeof properties === 'object') {
        const shape: Record<string, z.ZodType<unknown>> = {};
        for (const [key, prop] of Object.entries(properties)) {
          shape[key] = jsonSchemaToZod(prop);
        }
        return z.object(shape);
      }
      // Object without defined properties - use record with string values as safe fallback
      return z.record(z.string(), z.string());
    }
    case 'array': {
      const items = jsonSchema.items as Record<string, unknown> | undefined;
      const itemSchema = items ? jsonSchemaToZod(items) : z.string();
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
      logger?.warn(
        { unsupportedType: schemaType, schema: jsonSchema },
        'Unsupported JSON schema type, using string fallback'
      );
      return z.string();
  }
}
