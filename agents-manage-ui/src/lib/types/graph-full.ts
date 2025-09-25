import { z } from 'zod';

/**
 * Graph Full API Types and Schemas
 *
 * This module imports the original schemas from @inkeep/agents-core and re-exports
 * them with agent-builder specific utilities and types.
 */

// Import and re-export client-safe schemas from @inkeep/agents-core client exports
export {
  // Types
  type AgentApiInsert as AgentApi,
  AgentApiInsertSchema as AgentApiSchema,
  AgentGraphApiInsertSchema as AgentGraphApiSchema,
  type AgentGraphInsert as AgentGraphApi,
  ErrorResponseSchema,
  type FullGraphDefinition,
  // Core schemas
  FullGraphDefinitionSchema,
  ListResponseSchema,
  // Response schemas
  SingleResponseSchema,
  // Parameter schemas
  TenantParamsSchema,
  ToolApiInsertSchema as ToolApiSchema,
  type ToolInsert as ToolApi,
} from '@inkeep/agents-core/client-exports';

import { type FullGraphDefinition, TenantParamsSchema } from '@inkeep/agents-core/client-exports';
import type { SingleResponse } from './response';

// Agent-builder specific parameter schema
export const GraphIdParamsSchema = TenantParamsSchema.extend({
  graphId: z.string(),
});

// Inferred Types
export type TenantParams = z.infer<typeof TenantParamsSchema>;
export type GraphIdParams = z.infer<typeof GraphIdParamsSchema>;

export type ErrorResponse = {
  error: string;
  message?: string;
  details?: unknown;
};

export interface Graph {
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
