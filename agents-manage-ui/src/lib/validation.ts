import { StringRecordSchema } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import { transformToJson } from '@/lib/json-schema-validation';

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

function addIssue(ctx: z.RefinementCtx, error: z.ZodError) {
  ctx.addIssue({
    code: 'custom',
    message: z.prettifyError(error).split('✖ ').join('').trim(),
  });
}

export function createCustomHeadersSchema(customHeaders?: string) {
  const zodSchema = z
    .string()
    .trim()
    .transform((value, ctx) => (value ? transformToJson(value, ctx) : {}))
    // superRefine to attach error to `headers` field instead of possible nested e.g. headers.something
    .superRefine((value, ctx) => {
      // First validate default schema
      const result = StringRecordSchema.safeParse(value);
      if (!result.success) {
        addIssue(ctx, result.error);
        return;
      }
      if (customHeaders) {
        try {
          const customSchema = z.fromJSONSchema(JSON.parse(customHeaders));
          const result = customSchema.safeParse(value);
          if (result.success) return;
          addIssue(ctx, result.error);
        } catch (error) {
          const message = error instanceof Error ? error.message : error;
          ctx.addIssue({
            code: 'custom',
            message: `Error during parsing JSON schema headers: ${message}`,
          });
        }
      }
    });

  return zodSchema;
}
