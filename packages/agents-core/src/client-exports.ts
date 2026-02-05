/**
 * Client-Safe Schema Exports
 *
 * This file exports only the Zod schemas and types that are safe to use
 * in client-side applications (like Next.js builds) without importing
 * server-side database dependencies.
 */

import { z } from '@hono/zod-openapi';
import { schemaValidationDefaults } from './constants/schema-validation/defaults';
import { CredentialStoreType } from './types';
import {
  FullAgentAgentInsertSchema,
  type FunctionApiInsertSchema,
  MAX_ID_LENGTH,
  type TriggerApiSelectSchema,
  type TriggerInvocationApiSelectSchema,
} from './validation/schemas';

// Destructure defaults for use in schemas
const {
  AGENT_EXECUTION_TRANSFER_COUNT_MAX,
  AGENT_EXECUTION_TRANSFER_COUNT_MIN,
  STATUS_UPDATE_MAX_INTERVAL_SECONDS,
  STATUS_UPDATE_MAX_NUM_EVENTS,
  VALIDATION_AGENT_PROMPT_MAX_CHARS,
  VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS,
} = schemaValidationDefaults;

export { DEFAULT_NANGO_STORE_ID } from './credential-stores/default-constants';

export { validatePropsAsJsonSchema } from './validation/props-validation';

export {
  AgentApiInsertSchema,
  type AgentStopWhen,
  AgentStopWhenSchema,
  ApiKeyApiInsertSchema,
  ArtifactComponentApiInsertSchema,
  DataComponentApiInsertSchema,
  ExternalAgentApiInsertSchema,
  FunctionApiInsertSchema,
  FunctionApiSelectSchema,
  FunctionApiUpdateSchema,
  type ModelSettings,
  ModelSettingsSchema,
  ProjectApiInsertSchema,
  type SignatureSource,
  type SignatureVerificationConfig,
  SignatureVerificationConfigSchema,
  type SignedComponent,
  type StopWhen,
  StopWhenSchema,
  type SubAgentStopWhen,
  SubAgentStopWhenSchema,
  TriggerApiInsertSchema,
  TriggerApiSelectSchema,
  TriggerApiUpdateSchema,
  TriggerInvocationApiSelectSchema,
  TriggerInvocationListResponse,
  TriggerInvocationResponse,
  TriggerInvocationStatusEnum,
  TriggerListResponse,
  TriggerResponse,
  TriggerWithWebhookUrlListResponse,
  TriggerWithWebhookUrlResponse,
  TriggerWithWebhookUrlSchema,
} from './validation/schemas';

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  total: z.number(),
  pages: z.number(),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
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
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  userId: z.string().nullish(),
  toolId: z.string().nullish(),
  createdBy: z.string().nullish(),
});

export const ContextConfigApiInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
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

export type ToolApiInsert = z.infer<typeof ToolApiInsertSchema>;
export type FunctionApiInsert = z.infer<typeof FunctionApiInsertSchema>;
export type TriggerApiSelect = z.infer<typeof TriggerApiSelectSchema>;
export type TriggerInvocationApiSelect = z.infer<typeof TriggerInvocationApiSelectSchema>;
export type ApiKeyApiSelect = z.infer<typeof ApiKeyApiSelectSchema>;
export type ApiKeyApiCreationResponse = z.infer<typeof ApiKeyApiCreationResponseSchema>;
export type CredentialReferenceApiInsert = z.infer<typeof CredentialReferenceApiInsertSchema>;
export type FullAgentDefinition = z.infer<typeof FullAgentDefinitionSchema>;
export type InternalAgentDefinition = z.infer<typeof FullAgentAgentInsertSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ID_LENGTH);
}

export { CredentialStoreType };
export { type OrgRole, OrgRoles, type ProjectRole, ProjectRoles } from './auth/authz/config';
export * from './constants/context-breakdown';
export * from './constants/otel-attributes';
export * from './constants/signoz-queries';
export { MCPTransportType } from './types';
export { detectAuthenticationRequired } from './utils/auth-detection';
export { transformToJson } from './validation/json-schema-validation';
