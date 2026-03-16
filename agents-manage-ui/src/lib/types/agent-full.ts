/**
 * Agent Full API Types and Schemas
 *
 * This module imports the original schemas from @inkeep/agents-core and re-exports
 * them with agent-builder specific utilities and types.
 */

// Import core types and schemas
import type { AgentApiInsert } from '@inkeep/agents-core/client-exports';
import type { FullAgentResponse } from '@/components/agent/form/validation';
import type { SingleResponse } from './response';

// Re-export types and schemas
// TODO remove this export
export type {
  FullAgentOutput,
  FullAgentPayload,
  FullAgentResponse,
} from '@/components/agent/form/validation';

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
