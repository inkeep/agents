import { z } from '@hono/zod-openapi';
import { validateJsonSchemaForLlm } from './json-schema-validation';
import type { dataComponents } from '../db/manage/manage-schema';

type ExtendSchema<T> = Partial<Record<keyof T, z.ZodTypeAny>>;

/**
 * Schema for individual property definitions
 * (what lives under `properties.{propertyName}`)
 */
const PropertySchema = z
  .object({
    type: z.string({
      required_error: 'Each property must have a valid "type"',
    }),
    description: z
      .string({
        required_error: 'Each property must have a "description" for LLM compatibility',
      })
      .min(1, 'Each property must have a "description" for LLM compatibility'),
  })
  .loose(); // allow additional JSON Schema keywords

/**
 * LLM-compatible JSON Schema validator
 */
export const LlmJsonSchema = z
  .object({
    type: z.literal('object', {
      errorMap: () => ({
        message: 'Schema must have type: "object" for LLM compatibility',
      }),
    }),

    properties: z.record(PropertySchema, {
      required_error: 'Schema must have a "properties" object',
    }),

    required: z
      .array(z.string())
      .optional()
      .refine((v) => v === undefined || Array.isArray(v), {
        message: 'Schema must have a "required" array (can be empty)',
      }),
  })
  .loose();

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
