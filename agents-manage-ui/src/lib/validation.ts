import {
  AgentApiInsertSchema,
  type AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchema,
  HeadersSchema,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

export const AgentSchema = AgentApiInsertSchema.pick({
  name: true,
  id: true,
  description: true,
});

export type AgentInput = z.input<typeof AgentSchema>;

function addIssue(ctx: z.RefinementCtx, error: z.ZodError) {
  ctx.addIssue({
    code: 'custom',
    message: z.prettifyError(error).split('✖ ').join('').trim(),
  });
}

export function createCustomHeadersSchema(customHeaders?: string) {
  const zodSchema = z
    .string()
    .trim()
    .transform((value, ctx) => (value ? transformToJson(value, ctx) : {}))
    // superRefine to attach error to `headers` field instead of possible nested e.g. headers.something
    .superRefine((value, ctx) => {
      // First validate default schema
      const result = HeadersSchema.safeParse(value);
      if (!result.success) {
        addIssue(ctx, result.error);
        return;
      }
      if (customHeaders) {
        try {
          const customSchema = z.fromJSONSchema(JSON.parse(customHeaders));
          const result = customSchema.safeParse(value);
          if (result.success) return;
          addIssue(ctx, result.error);
        } catch (error) {
          const message = error instanceof Error ? error.message : error;
          ctx.addIssue({
            code: 'custom',
            message: `Error during parsing JSON schema headers: ${message}`,
          });
        }
      }
    });

  return zodSchema;
}

const ContextConfigSchema = AgentWithinContextOfProjectSchema.shape.contextConfig.unwrap().shape;
const StatusUpdatesSchema = AgentWithinContextOfProjectSchema.shape.statusUpdates.unwrap().shape;
const ModelsSchema = AgentWithinContextOfProjectSchema.shape.models.unwrap().shape;

const ModelsBaseSchema = ModelsSchema.base.unwrap();
const ModelsStructuredOutputSchema = ModelsSchema.structuredOutput.unwrap();
const ModelsSummarizerSchema = ModelsSchema.summarizer.unwrap();

const StringToJsonSchema = z
  .string()
  .trim()
  .transform((value, ctx) => (value === '' ? undefined : transformToJson(value, ctx)))
  .refine((v) => v !== null, 'Cannot be null');

export const FullAgentUpdateSchema = AgentWithinContextOfProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  prompt: true,
  stopWhen: true,
}).extend({
  contextConfig: z.strictObject({
    id: ContextConfigSchema.id,
    headersSchema: StringToJsonSchema.pipe(ContextConfigSchema.headersSchema).optional(),
    contextVariables: StringToJsonSchema.pipe(ContextConfigSchema.contextVariables).optional(),
  }),
  statusUpdates: z.strictObject({
    ...StatusUpdatesSchema,
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

export type FullAgentResponse = z.infer<typeof AgentWithinContextOfProjectResponse>['data'];

export type FullAgentDefinition = z.input<typeof AgentWithinContextOfProjectSchema>;

/**
 * Partial fields excluding keys from zod schema which is handled by react-hook-form
 * which isn't yet migrated to react hook form.
 * @deprecated
 */
export type PartialFullAgentDefinition = Omit<
  FullAgentDefinition,
  keyof z.input<typeof FullAgentUpdateSchema>
>;
