import { StringRecordSchema, transformToJson } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

type HeadersValue = z.output<typeof StringRecordSchema>;
type HeadersPipeSchema = z.ZodType<HeadersValue, HeadersValue>;

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
