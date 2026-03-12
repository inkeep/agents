import { jsonSchemaToZod } from 'json-schema-to-zod';
import { isPlainObject } from './shared';

export function convertJsonSchemaToZodSafe(
  schema: unknown,
  options?: { conversionOptions?: Parameters<typeof jsonSchemaToZod>[1] }
): string {
  if (!isPlainObject(schema)) {
    console.warn('Schema conversion skipped: non-object schema provided, using z.any()');
    return 'z.any()';
  }
  try {
    return jsonSchemaToZod(schema, options?.conversionOptions);
  } catch (error) {
    console.warn(
      `Schema conversion failed: ${error instanceof Error ? error.message : String(error)}. Falling back to z.any()`
    );
    return 'z.any()';
  }
}
