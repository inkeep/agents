import { z } from '@hono/zod-openapi';
import { getJsonParseError, validateJsonSchemaForLlm } from './json-schema-validation';

export const DataComponentExtendSchema = {
  name: z.string().trim().nonempty(),
  description: z.string().trim().nullable(),
  props: z.record(z.string(), z.unknown()).transform(transformProps),
};

function transformProps<T extends Record<string, unknown>>(parsed: T, ctx: z.RefinementCtx<T>) {
  console.log('transformProps', [parsed]);
  try {
    const validationResult = validateJsonSchemaForLlm(parsed);
    if (!validationResult.isValid) {
      const errorMessage = validationResult.errors[0]?.message || 'Invalid JSON schema';
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage,
      });
      return z.NEVER;
    }
    // @ts-expect-error
    parsed.required ??= [];
    return parsed;
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: getJsonParseError(error),
    });
    return z.NEVER;
  }
}
