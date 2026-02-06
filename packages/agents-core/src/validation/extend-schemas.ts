import { z } from '@hono/zod-openapi';
import { schemaValidationDefaults } from '../constants/schema-validation/defaults';
import type { agents, artifactComponents, dataComponents } from '../db/manage/manage-schema';
import { validateJsonSchemaForLlm } from './json-schema-validation';

const { VALIDATION_AGENT_PROMPT_MAX_CHARS } = schemaValidationDefaults;

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

export const AgentWithinContextOfProjectExtendSchema = {
  prompt: z
    .string()
    .trim()
    .max(
      VALIDATION_AGENT_PROMPT_MAX_CHARS,
      `Agent prompt cannot exceed ${VALIDATION_AGENT_PROMPT_MAX_CHARS} characters`
    )
    .optional(),
} satisfies ExtendSchema<typeof agents>;

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
