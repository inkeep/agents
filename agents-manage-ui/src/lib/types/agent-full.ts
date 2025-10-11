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
  AgentGraphApiInsertSchema,
  type AgentGraphInsert,
  type FullGraphDefinition as CoreFullGraphDefinition,
  ErrorResponseSchema,
  type ExternalAgentDefinition,
  FullGraphDefinitionSchema,
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

// Extend FullGraphDefinition with UI-specific lookup maps
export type FullGraphDefinition = CoreFullGraphDefinition & {
  tools?: Record<string, ToolApiInsert>;
  functionTools?: Record<string, any>; // Function tools are agent-scoped
  functions?: Record<string, FunctionApiInsert>;
};

// Re-export core types with aliases
export type AgentApi = AgentApiInsert;
export type AgentGraphApi = AgentGraphInsert;
export type ToolApi = ToolInsert;
export const AgentApiSchema = AgentApiInsertSchema;
export const AgentGraphApiSchema = AgentGraphApiInsertSchema;
export const ToolApiSchema = ToolApiInsertSchema;

// Re-export types and schemas
export {
  ErrorResponseSchema,
  type ExternalAgentDefinition,
  FullGraphDefinitionSchema,
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
export type CreateGraphResponse = SingleResponse<FullGraphDefinition>;
export type GetGraphResponse = SingleResponse<FullGraphDefinition>;
export type UpdateGraphResponse = SingleResponse<FullGraphDefinition>;

// API Error Types
export type GraphApiError = {
  code: 'not_found' | 'bad_request' | 'internal_server_error' | 'conflict';
  message: string;
};
