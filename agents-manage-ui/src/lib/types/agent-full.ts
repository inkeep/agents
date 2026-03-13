/**
 * Agent Full API Types and Schemas
 *
 * This module imports the original schemas from @inkeep/agents-core and re-exports
 * them with agent-builder specific utilities and types.
 */

// Import core types and schemas
import type {
  AgentApiInsert,
  AgentWithinContextOfProjectResponse,
  AgentWithinContextOfProjectSchema,
} from '@inkeep/agents-core/client-exports';
import type { z } from 'zod';
import type { FullAgentUpdateSchema } from '@/components/agent/form/validation';
import type { SingleResponse } from './response';

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
