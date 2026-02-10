import { StringRecordSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import { transformToJson } from '@/lib/json-schema-validation';

type HeadersValue = z.output<typeof StringRecordSchema>;
type HeadersPipeSchema = z.ZodType<HeadersValue, HeadersValue>;

/**
 * Reusable ID validation schema for database primary keys.
 * Ensures IDs are alphanumeric with underscores and dashes allowed, no whitespace.
 */
export const idSchema = z
  .string()
  .min(1, 'Id is required.')
  .max(64, 'Id must be less than 64 characters.')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Id must contain only alphanumeric characters, underscores, and dashes. No spaces allowed.'
  );

export function createCustomHeadersSchema(customHeaders?: string) {
  const zodSchema = z
    .string()
    .trim()
    .transform((value, ctx) => (value ? transformToJson(value, ctx) : {}))
    .pipe(StringRecordSchema);
  if (!customHeaders) {
    return zodSchema;
  }
  try {
    const CustomHeadersSchema = z.fromJSONSchema(JSON.parse(customHeaders)) as HeadersPipeSchema;
    return zodSchema.pipe(CustomHeadersSchema);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return zodSchema.pipe(
      z.custom(() => false, `Error during parsing JSON schema headers: ${message}`)
    );
  }
}
