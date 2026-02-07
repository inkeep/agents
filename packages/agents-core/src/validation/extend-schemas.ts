import { z } from '@hono/zod-openapi';
import type { artifactComponents, dataComponents } from '../db/manage/manage-schema';
import { JsonSchemaForLlmSchema } from './json-schema-validation';

type ExtendSchema<T> = Partial<Record<keyof T, z.ZodTypeAny>>;

const NameSchema = z.string().trim().nonempty('Name is required');
// todo check if we need null here
const DescriptionSchema = z.string().trim().nullish();
const PropsSchema = z
  .record(z.string(), z.unknown(), 'Schema must be an object')
  .transform(transformProps);

export const DataComponentExtendSchema = {
  name: NameSchema,
  description: DescriptionSchema,
  props: PropsSchema,
} satisfies ExtendSchema<typeof dataComponents>;

export const ArtifactComponentExtendSchema = {
  name: NameSchema,
  description: DescriptionSchema,
  props: PropsSchema.nullable(),
} satisfies ExtendSchema<typeof artifactComponents>;

function transformProps<T extends Record<string, unknown>>(parsed: T, ctx: z.RefinementCtx<T>) {
  const validationResult = JsonSchemaForLlmSchema.safeParse(parsed);
  if (!validationResult.success) {
    ctx.addIssue({
      code: 'custom',
      message: validationResult.error.issues[0].message,
    });
    return z.NEVER;
  }
  // @ts-expect-error
  parsed.required ??= [];
  return parsed;
}
