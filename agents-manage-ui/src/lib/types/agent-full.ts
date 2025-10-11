import { z } from 'zod';

/**
 * Agent Full API Types and Schemas
 *
 * This module imports the original schemas from @inkeep/agents-core and re-exports
 * them with agent-builder specific utilities and types.
 */

// Import core types and schemas
import {
  type AgentApiInsert,
  AgentApiInsertSchema,
  AgentAgentApiInsertSchema,
  type AgentAgentInsert,
  type FullAgentDefinition as CoreFullAgentDefinition,
  ErrorResponseSchema,
  type ExternalAgentDefinition,
  FullAgentDefinitionSchema,
  type FunctionApiInsert,
  type InternalAgentDefinition,
  ListResponseSchema,
  SingleResponseSchema,
  TenantParamsSchema,
  type ToolApiInsert,
  ToolApiInsertSchema,
  type ToolInsert,
} from '@inkeep/agents-core/client-exports';
import type { SingleResponse } from './response';

// Extend FullAgentDefinition with UI-specific lookup maps
export type FullAgentDefinition = CoreFullAgentDefinition & {
  tools?: Record<string, ToolApiInsert>;
  functionTools?: Record<string, any>; // Function tools are agent-scoped
  functions?: Record<string, FunctionApiInsert>;
};

// Re-export core types with aliases
export type AgentApi = AgentApiInsert;
export type AgentAgentApi = AgentAgentInsert;
export type ToolApi = ToolInsert;
export const AgentApiSchema = AgentApiInsertSchema;
export const AgentAgentApiSchema = AgentAgentApiInsertSchema;
export const ToolApiSchema = ToolApiInsertSchema;

// Re-export types and schemas
export {
  ErrorResponseSchema,
  type ExternalAgentDefinition,
  FullAgentDefinitionSchema,
  type InternalAgentDefinition,
  ListResponseSchema,
  SingleResponseSchema,
  TenantParamsSchema,
};

// Agent-builder specific parameter schema
export const AgentIdParamsSchema = TenantParamsSchema.extend({
  agentId: z.string(),
});

// Inferred Types
export type TenantParams = z.infer<typeof TenantParamsSchema>;
export type AgentIdParams = z.infer<typeof AgentIdParamsSchema>;

export type ErrorResponse = {
  error: string;
  message?: string;
  details?: unknown;
};

export interface Agent {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

// API Response Types
export type CreateAgentResponse = SingleResponse<FullAgentDefinition>;
export type GetAgentResponse = SingleResponse<FullAgentDefinition>;
export type UpdateAgentResponse = SingleResponse<FullAgentDefinition>;

// API Error Types
export type AgentApiError = {
  code: 'not_found' | 'bad_request' | 'internal_server_error' | 'conflict';
  message: string;
};
