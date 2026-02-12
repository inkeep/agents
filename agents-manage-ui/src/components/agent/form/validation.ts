import {
  transformToJson,
  AgentWithinContextOfProjectSchema,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

const OriginalContextConfigSchema =
  AgentWithinContextOfProjectSchema.shape.contextConfig.unwrap().shape;
const StatusUpdatesSchema = AgentWithinContextOfProjectSchema.shape.statusUpdates.unwrap().shape;
const ModelsSchema = AgentWithinContextOfProjectSchema.shape.models.unwrap().shape;
const StopWhenSchema = AgentWithinContextOfProjectSchema.shape.stopWhen.unwrap();

const ModelsBaseSchema = ModelsSchema.base.unwrap();
const ModelsStructuredOutputSchema = ModelsSchema.structuredOutput.unwrap();
const ModelsSummarizerSchema = ModelsSchema.summarizer.unwrap();

const StringToJsonSchema = z
  .string()
  .trim()
  .transform((value, ctx) => (value === '' ? undefined : transformToJson(value, ctx)))
  .refine((v) => v !== null, 'Cannot be null');

const NullToUndefinedSchema = z
  // Normalize number input: <input type="number"> produce `null` for empty value,
  // but this schema expects `undefined` (optional field), not `null`.
  .transform((value: number) => (value === null ? undefined : value));

export const ContextConfigSchema = z.strictObject({
  id: OriginalContextConfigSchema.id,
  headersSchema: StringToJsonSchema.pipe(OriginalContextConfigSchema.headersSchema).optional(),
  contextVariables: StringToJsonSchema.pipe(
    OriginalContextConfigSchema.contextVariables
  ).optional(),
});

export const FullAgentUpdateSchema = AgentWithinContextOfProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  prompt: true,
}).extend({
  stopWhen: StopWhenSchema.extend({
    transferCountIs: NullToUndefinedSchema.pipe(StopWhenSchema.shape.transferCountIs).optional(),
  }).optional(),
  contextConfig: ContextConfigSchema,
  statusUpdates: z.strictObject({
    ...StatusUpdatesSchema,
    numEvents: NullToUndefinedSchema.pipe(StatusUpdatesSchema.numEvents).optional(),
    timeInSeconds: NullToUndefinedSchema.pipe(StatusUpdatesSchema.timeInSeconds).optional(),
    statusComponents: StringToJsonSchema.pipe(StatusUpdatesSchema.statusComponents).optional(),
  }),
  models: z.strictObject({
    base: ModelsBaseSchema.extend({
      providerOptions: StringToJsonSchema.pipe(ModelsBaseSchema.shape.providerOptions).optional(),
    }),
    structuredOutput: ModelsStructuredOutputSchema.extend({
      providerOptions: StringToJsonSchema.pipe(
        ModelsStructuredOutputSchema.shape.providerOptions
      ).optional(),
    }),
    summarizer: ModelsSummarizerSchema.extend({
      providerOptions: StringToJsonSchema.pipe(
        ModelsSummarizerSchema.shape.providerOptions
      ).optional(),
    }),
  }),
});
