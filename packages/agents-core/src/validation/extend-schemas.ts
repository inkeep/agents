import { z } from '@hono/zod-openapi';
import type { artifactComponents, dataComponents } from '../db/manage/manage-schema';
import { validateJsonSchemaForLlm } from './json-schema-validation';

type ExtendSchema<T> = Partial<Record<keyof T, z.ZodTypeAny>>;

const NameSchema = z.string().trim().nonempty('Name is required');
const DescriptionSchema = z.string().trim().optional();
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
  console.log('transformProps', [parsed]);
  const validationResult = validateJsonSchemaForLlm(parsed);
  if (!validationResult.isValid) {
    const errorMessage = validationResult.errors[0]?.message || 'Invalid JSON schema';
    ctx.addIssue({
      code: 'custom',
      message: errorMessage,
    });
    return z.NEVER;
  }
  // @ts-expect-error
  parsed.required ??= [];
  return parsed;
}
