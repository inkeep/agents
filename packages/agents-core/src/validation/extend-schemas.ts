import { z } from '@hono/zod-openapi';
import type { artifactComponents, dataComponents } from '../db/manage/manage-schema';
import { JsonSchemaForLlmSchema } from './json-schema-validation';

type ExtendSchema<T> = Partial<Record<keyof T, z.ZodTypeAny>>;

const NameSchema = z.string().trim().nonempty('Name is required');
// todo check if we need null here
const DescriptionSchema = z.string().trim().nullish();

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
