import { z } from 'zod';

/**
 * Agent Full API Types and Schemas
 *
 * This module imports the original schemas from @inkeep/agents-core and re-exports
 * them with agent-builder specific utilities and types.
 */

// Import core types and schemas
import {
  AgentAgentApiInsertSchema,
  type AgentAgentInsert,
  type AgentApiInsert,
  AgentApiInsertSchema,
  type FullAgentDefinition as CoreFullAgentDefinition,
  ErrorResponseSchema,
  type ExternalAgentApiInsert,
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
import type { TeamAgent } from './team-agents';

// Extend FullAgentDefinition with UI-specific lookup maps
export type FullAgentDefinition = CoreFullAgentDefinition & {
  tools?: Record<string, ToolApiInsert>;
  externalAgents?: Record<string, ExternalAgentApiInsert>;
  teamAgents?: Record<string, TeamAgent>;
  functionTools?: Record<string, any>; // Function tools are agent-scoped
  functions?: Record<string, FunctionApiInsert>;
};

// Re-export core types with aliases
export type AgentApi = AgentApiInsert;
export type AgentAgentApi = AgentAgentInsert;
export type ToolApi = ToolInsert;
const AgentApiSchema = AgentApiInsertSchema;
const AgentAgentApiSchema = AgentAgentApiInsertSchema;
const ToolApiSchema = ToolApiInsertSchema;

// Re-export types and schemas
export {
  
  type ExternalAgentDefinition,
  FullAgentDefinitionSchema,
  type InternalAgentDefinition,
  
  
  
};

// Agent-builder specific parameter schema
const AgentIdParamsSchema = TenantParamsSchema.extend({
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
