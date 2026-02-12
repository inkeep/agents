import { z } from '@hono/zod-openapi';
import type { artifactComponents, dataComponents } from '../db/manage/manage-schema';
import { JsonSchemaForLlmSchema } from './json-schemas';

type ExtendSchema<T> = Partial<Record<keyof T, z.ZodTypeAny>>;

export const NameSchema = z
  .string()
  .trim()
  .nonempty('Name is required')
  .max(256)
  .openapi('NameSchema');

export const DescriptionSchema = z.string().trim().nullish().openapi('DescriptionSchema');

/**
 * Used in z.transform()
 */
export function transformToJson<T extends string>(value: T, ctx: z.RefinementCtx<T>) {
  try {
    return JSON.parse(value);
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid JSON syntax',
    });
    return z.NEVER;
  }
}

export const DataComponentExtendSchema = {
  name: NameSchema,
  description: DescriptionSchema,
  props: JsonSchemaForLlmSchema,
} satisfies ExtendSchema<typeof dataComponents>;

export const ArtifactComponentExtendSchema = {
  name: NameSchema,
  description: DescriptionSchema,
  props: JsonSchemaForLlmSchema.nullable(),
} satisfies ExtendSchema<typeof artifactComponents>;
