/**
 * Agent Full API Types and Schemas
 *
 * This module imports the original schemas from @inkeep/agents-core and re-exports
 * them with agent-builder specific utilities and types.
 */

// Import core types and schemas
import {
  type AgentApiInsert,
  type AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchema,
  transformToJson,
} from '@inkeep/agents-core/client-exports';
import { z } from 'zod';
import type { SingleResponse } from './response';

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

// Re-export types and schemas
export type { InternalAgentDefinition } from '@inkeep/agents-core/client-exports';

export interface Agent {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

// API Response Types
export type CreateAgentResponse = SingleResponse<AgentApiInsert>;
export type GetAgentResponse = SingleResponse<FullAgentResponse>;
export type UpdateFullAgentResponse = SingleResponse<FullAgentResponse>;
export type UpdateAgentResponse = SingleResponse<AgentApiInsert>;

export type SubAgentTeamAgentConfig = {
  agentId: string;
  headers?: Record<string, string>;
};

export type SubAgentExternalAgentConfig = {
  externalAgentId: string;
  headers?: Record<string, string>;
};

// SubAgentTeamAgentConfigLookup: subAgentId -> relationshipId -> config
export type SubAgentTeamAgentConfigLookup = Record<string, Record<string, SubAgentTeamAgentConfig>>;

// SubAgentExternalAgentConfigLookup: subAgentId -> relationshipId -> config
export type SubAgentExternalAgentConfigLookup = Record<
  string,
  Record<string, SubAgentExternalAgentConfig>
>;

// Type for agent tool configuration lookup including both selection and headers
export type AgentToolConfig = {
  toolId: string;
  toolSelection?: string[] | null;
  headers?: Record<string, string>;
  toolPolicies?: Record<string, { needsApproval?: boolean }>;
};

// AgentToolConfigLookup: subAgentId -> relationshipId -> config
export type AgentToolConfigLookup = Record<string, Record<string, AgentToolConfig>>;
