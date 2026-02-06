import {
  AgentApiInsertSchema,
  type AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchema,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';

export const AgentSchema = AgentApiInsertSchema.pick({
  name: true,
  id: true,
  description: true,
});

export type AgentInput = z.input<typeof AgentSchema>;

export const DefaultHeadersSchema = z.record(
  z.string(),
  z.string('All header values must be strings'),
  'Must be valid JSON object'
);

function addIssue(ctx: z.RefinementCtx, error: z.ZodError) {
  ctx.addIssue({
    code: 'custom',
    message: z.prettifyError(error).split('✖ ').join('').trim(),
  });
}

export function createCustomHeadersSchema(customHeaders: string) {
  const zodSchema = z
    .string()
    .trim()
    .transform((value, ctx) => (value ? transformToJson(value, ctx) : {}))
    // superRefine to attach error to `headers` field instead of possible nested e.g. headers.something
    .superRefine((value, ctx) => {
      // First validate default schema
      const result = DefaultHeadersSchema.safeParse(value);
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

const ContextConfigSchema = AgentWithinContextOfProjectSchema.shape.contextConfig.shape;
const StatusUpdatesSchema = AgentWithinContextOfProjectSchema.shape.statusUpdates.shape;

export const FullAgentUpdateSchema = AgentWithinContextOfProjectSchema.pick({
  id: true,
  name: true,
  description: true,
  prompt: true,
}).extend({
  contextConfig: z.strictObject({
    id: ContextConfigSchema.id,
    headersSchema: z
      .string()
      .trim()
      .transform((value, ctx) => (value ? transformToJson(value, ctx) : null))
      .pipe(ContextConfigSchema.headersSchema)
      .optional(),
    contextVariables: z
      .string()
      .trim()
      .transform((value, ctx) => (value ? transformToJson(value, ctx) : null))
      .pipe(ContextConfigSchema.contextVariables)
      .optional(),
  }),
  statusUpdates: z.strictObject({
    ...StatusUpdatesSchema,
    statusComponents: z
      .string()
      .trim()
      .transform((value, ctx) => (value ? transformToJson(value, ctx) : null))
      .pipe(StatusUpdatesSchema.statusComponents)
      .optional(),
  }),
});

export type FullAgentResponse = z.infer<typeof AgentWithinContextOfProjectResponse>['data'];
