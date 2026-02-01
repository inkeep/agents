import { z } from '@hono/zod-openapi';
import { validateJsonSchemaForLlm } from './json-schema-validation';
import type { dataComponents } from '../db/manage/manage-schema';

type ExtendSchema<T> = Partial<Record<keyof T, z.ZodTypeAny>>;

export const DataComponentExtendSchema = {
  name: z.string().trim().nonempty(),
  description: z.string().trim().optional(),
  props: z.record(z.string(), z.unknown(), 'Schema must be an object').transform(transformProps),
} satisfies ExtendSchema<typeof dataComponents>;

function transformProps<T extends Record<string, unknown>>(parsed: T, ctx: z.RefinementCtx<T>) {
  console.log('transformProps', [parsed]);
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
}
