import { ProjectApiInsertSchema, transformToJson } from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import { StringToJsonSchema } from '@/lib/validation';

const ModelsSchema = ProjectApiInsertSchema.shape.models.shape;

const ModelsBaseSchema = ModelsSchema.base;
const ModelsStructuredOutputSchema = ModelsSchema.structuredOutput.unwrap();
const ModelsSummarizerSchema = ModelsSchema.summarizer.unwrap();

const StopWhenSchema = ProjectApiInsertSchema.shape.stopWhen.unwrap();

export const ProjectSchema = ProjectApiInsertSchema.extend({
  models: z
    .strictObject({
      base: ModelsBaseSchema.extend({
        providerOptions: StringToJsonSchema.pipe(ModelsBaseSchema.shape.providerOptions),
      }),
      structuredOutput: ModelsStructuredOutputSchema.extend({
        providerOptions: StringToJsonSchema.pipe(
          ModelsStructuredOutputSchema.shape.providerOptions
        ),
      }).optional(),
      summarizer: ModelsSummarizerSchema.extend({
        providerOptions: StringToJsonSchema.pipe(ModelsSummarizerSchema.shape.providerOptions),
      }).optional(),
    })
    .transform(({ base, structuredOutput, summarizer }) => {
      return {
        base,
        ...(structuredOutput?.model && { structuredOutput }),
        ...(summarizer?.model && { summarizer }),
      };
    }),
  stopWhen: z
    .strictObject({
      ...StopWhenSchema.shape,
      stepCountIs: z.preprocess((v) => v ?? undefined, StopWhenSchema.shape.stepCountIs).optional(),
      transferCountIs: z
        .preprocess((v) => v ?? undefined, StopWhenSchema.shape.transferCountIs)
        .optional(),
    })
    .optional(),
});

export type ProjectInput = z.input<typeof ProjectSchema>;
export type ProjectOutput = z.output<typeof ProjectSchema>;
