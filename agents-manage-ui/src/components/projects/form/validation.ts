import { ProjectApiInsertSchema, transformToJson } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const ModelsSchema = ProjectApiInsertSchema.shape.models.shape;

const ModelsBaseSchema = ModelsSchema.base;
const ModelsStructuredOutputSchema = ModelsSchema.structuredOutput.unwrap();
const ModelsSummarizerSchema = ModelsSchema.summarizer.unwrap();

const StringToJsonSchema = z
  .string()
  .trim()
  .transform((value, ctx) => (value === '' ? undefined : transformToJson(value, ctx)))
  .refine((v) => v !== null, 'Cannot be null')
  .optional();

export const ProjectSchema = ProjectApiInsertSchema.extend({
  models: z.strictObject({
    base: ModelsBaseSchema.extend({
      providerOptions: StringToJsonSchema.pipe(ModelsBaseSchema.shape.providerOptions),
    }),
    structuredOutput: ModelsStructuredOutputSchema.extend({
      providerOptions: StringToJsonSchema.pipe(ModelsStructuredOutputSchema.shape.providerOptions),
    }),
    summarizer: ModelsSummarizerSchema.extend({
      providerOptions: StringToJsonSchema.pipe(ModelsSummarizerSchema.shape.providerOptions),
    }),
  }),
});

export type ProjectInput = z.input<typeof ProjectSchema>;
export type ProjectOutput = z.output<typeof ProjectSchema>;
