import { z } from '@hono/zod-openapi';
import type {
  artifactComponents,
  contextConfigs,
  dataComponents,
} from '../db/manage/manage-schema';
import { validateJsonSchemaForLlm } from './json-schema-validation';

type ExtendSchema<T> = Partial<Record<keyof T, z.ZodTypeAny>>;

const NameSchema = z.string().trim().nonempty('Name is required');
// todo check if we need null here
const DescriptionSchema = z.string().trim().nullish();
const PropsSchema = z
  .record(z.string(), z.unknown(), 'Schema must be an object')
  .transform(transformProps);

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

export const ResourceIdSchema = z
  .string()
  .trim()
  .nonempty('Id is required')
  .max(MAX_ID_LENGTH)
  .regex(URL_SAFE_ID_PATTERN, {
    message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
  })
  .refine((value) => value !== 'new', 'Must not use a reserved name "new"')
  .openapi({
    description: 'Resource identifier',
    example: 'resource_789',
  });

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

export const ContextConfigExtendSchema = {
  id: ResourceIdSchema,
  headersSchema: z.record(z.string(), z.unknown(), 'Must be valid JSON object').nullable().openapi({
    type: 'object',
    description: 'JSON Schema for validating request headers',
  }),
  contextVariables: z
    .record(z.string(), z.unknown(), 'Must be valid JSON object')
    .nullable()
    .openapi({
      type: 'object',
      description: 'Context variables configuration with fetch definitions',
    }),
} satisfies ExtendSchema<typeof contextConfigs>;

function transformProps<T extends Record<string, unknown>>(parsed: T, ctx: z.RefinementCtx<T>) {
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
