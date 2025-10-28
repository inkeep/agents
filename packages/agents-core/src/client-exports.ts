/**
 * Client-Safe Schema Exports
 *
 * This file exports only the Zod schemas and types that are safe to use
 * in client-side applications (like Next.js builds) without importing
 * server-side database dependencies.
 */

import { z } from 'zod';
import {
  AGENT_EXECUTION_TRANSFER_COUNT_MAX,
  AGENT_EXECUTION_TRANSFER_COUNT_MIN,
  STATUS_UPDATE_MAX_INTERVAL_SECONDS,
  STATUS_UPDATE_MAX_NUM_EVENTS,
  VALIDATION_AGENT_PROMPT_MAX_CHARS,
  VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS,
} from './constants/schema-validation';
import { CredentialStoreType, MCPTransportType } from './types';

import {
  type AgentStopWhen,
  AgentStopWhenSchema,
  type ApiKeyApiUpdateSchema,
  ArtifactComponentApiInsertSchema as ArtifactComponentApiInsertSchemaFromValidation,
  FullAgentAgentInsertSchema,
  type FunctionApiInsertSchema,
  type ModelSettings,
  ModelSettingsSchema,
  type StopWhen,
  StopWhenSchema,
  type SubAgentStopWhen,
  SubAgentStopWhenSchema,
} from './validation/schemas';

export { validatePropsAsJsonSchema } from './validation/props-validation';

export {
  StopWhenSchema,
  AgentStopWhenSchema,
  SubAgentStopWhenSchema,
  type StopWhen,
  type AgentStopWhen,
  type SubAgentStopWhen,
};

export {
  FunctionApiInsertSchema,
  FunctionApiSelectSchema,
  FunctionApiUpdateSchema,
} from './validation/schemas';

export const TenantParamsSchema = z.object({
  tenantId: z.string(),
});

export const TenantProjectParamsSchema = TenantParamsSchema.extend({
  projectId: z.string(),
});

export const TenantProjectIdParamsSchema = TenantProjectParamsSchema.extend({
  id: z.string(),
});

export const IdParamsSchema = z.object({
  id: z.string(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  total: z.number(),
  pages: z.number(),
});

export const ListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

export const SingleResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: itemSchema,
  });

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
});

export { ModelSettingsSchema, type ModelSettings };

export const AgentApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  model: ModelSettingsSchema.optional(),
  tools: z.array(z.string()).optional(),
  dataComponents: z.array(z.string()).optional(),
  artifactComponents: z.array(z.string()).optional(),
  canTransferTo: z.array(z.string()).optional(),
  canDelegateTo: z.array(z.string()).optional(),
  type: z.enum(['internal', 'external']).optional(),
});

export const ToolApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['mcp', 'hosted']),
  config: z.record(z.string(), z.unknown()),
  credentialReferenceId: z.string().optional(),
});

export const ApiKeyApiSelectSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  publicId: z.string(),
  keyHash: z.string(),
  keyPrefix: z.string(),
  name: z.string().optional(),
  lastUsedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ApiKeyApiCreationResponseSchema = z.object({
  data: z.object({
    apiKey: ApiKeyApiSelectSchema,
    key: z.string(),
  }),
});

export const CredentialReferenceApiInsertSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string(),
  type: z.enum(CredentialStoreType),
  credentialStoreId: z.string(),
  retrievalParams: z.record(z.string(), z.unknown()).nullish(),
});

export const DataComponentApiInsertSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  props: z.record(z.string(), z.unknown()),
  render: z
    .object({
      component: z.string(),
      mockData: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),
});

export const ArtifactComponentApiInsertSchema = ArtifactComponentApiInsertSchemaFromValidation;

export const ContextConfigApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const ExternalAgentApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  baseUrl: z.string(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  credentialReferenceId: z.string().nullable().optional(),
  type: z.literal('external').optional(),
});

export const AgentAgentApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  defaultSubAgentId: z.string().optional(),
});

export const FullAgentDefinitionSchema = AgentAgentApiInsertSchema.extend({
  subAgents: z.record(z.string(), z.union([FullAgentAgentInsertSchema])),
  contextConfig: z.optional(ContextConfigApiInsertSchema),
  models: z
    .object({
      base: z
        .object({
          model: z.string(),
          providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
      structuredOutput: z
        .object({
          model: z.string(),
          providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
      summarizer: z
        .object({
          model: z.string(),
          providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        })
        .optional(),
    })
    .optional(),
  stopWhen: z
    .object({
      transferCountIs: z
        .number()
        .min(AGENT_EXECUTION_TRANSFER_COUNT_MIN)
        .max(AGENT_EXECUTION_TRANSFER_COUNT_MAX)
        .optional(),
    })
    .optional(),
  prompt: z.string().max(VALIDATION_AGENT_PROMPT_MAX_CHARS).optional(),
  statusUpdates: z
    .object({
      enabled: z.boolean().optional(),
      numEvents: z.number().min(1).max(STATUS_UPDATE_MAX_NUM_EVENTS).optional(),
      timeInSeconds: z.number().min(1).max(STATUS_UPDATE_MAX_INTERVAL_SECONDS).optional(),
      prompt: z.string().max(VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS).optional(),
      statusComponents: z
        .array(
          z.object({
            type: z.string(),
            description: z.string().optional(),
            detailsSchema: z
              .object({
                type: z.literal('object'),
                properties: z.record(z.string(), z.any()),
                required: z.array(z.string()).optional(),
              })
              .optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

export type AgentApiInsert = z.infer<typeof AgentApiInsertSchema>;
export type ToolApiInsert = z.infer<typeof ToolApiInsertSchema>;
export type FunctionApiInsert = z.infer<typeof FunctionApiInsertSchema>;
export type ApiKeyApiSelect = z.infer<typeof ApiKeyApiSelectSchema>;
export type ApiKeyApiCreationResponse = z.infer<typeof ApiKeyApiCreationResponseSchema>;
export type ApiKeyApiUpdateResponse = z.infer<typeof ApiKeyApiUpdateSchema>;
export type CredentialReferenceApiInsert = z.infer<typeof CredentialReferenceApiInsertSchema>;
export type DataComponentApiInsert = z.infer<typeof DataComponentApiInsertSchema>;
export type ArtifactComponentApiInsert = z.infer<typeof ArtifactComponentApiInsertSchema>;
export type ContextConfigApiInsert = z.infer<typeof ContextConfigApiInsertSchema>;
export type ExternalAgentApiInsert = z.infer<typeof ExternalAgentApiInsertSchema>;
export type AgentAgentApiInsert = z.infer<typeof AgentAgentApiInsertSchema>;
export type FullAgentDefinition = z.infer<typeof FullAgentDefinitionSchema>;
export type InternalAgentDefinition = z.infer<typeof FullAgentAgentInsertSchema>;
export type ExternalAgentDefinition = z.infer<typeof ExternalAgentApiInsertSchema>;
export type TenantParams = z.infer<typeof TenantParamsSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const MIN_ID_LENGTH = 1;
export const MAX_ID_LENGTH = 255;
export const URL_SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_.]+$/;

export const resourceIdSchema = z
  .string()
  .min(MIN_ID_LENGTH)
  .max(MAX_ID_LENGTH)
  .regex(URL_SAFE_ID_PATTERN, {
    message: 'ID must contain only letters, numbers, hyphens, underscores, and dots',
  });

export function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ID_LENGTH);
}

export type ToolInsert = ToolApiInsert;
export type AgentAgentInsert = AgentAgentApiInsert;

export { CredentialStoreType, MCPTransportType };

export * from './constants/otel-attributes';
export * from './constants/signoz-queries';
export { detectAuthenticationRequired } from './utils/auth-detection';
