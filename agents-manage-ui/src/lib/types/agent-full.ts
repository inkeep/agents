/**
 * Agent Full API Types and Schemas
 *
 * This module imports the original schemas from @inkeep/agents-core and re-exports
 * them with agent-builder specific utilities and types.
 */

// Import core types and schemas
import type {
  AgentApiInsert,
  FullAgentDefinition as CoreFullAgentDefinition,
  ExternalAgentApiInsert,
  FunctionApiInsert,
  ToolApiInsert,
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
export type CreateFullAgentResponse = SingleResponse<FullAgentDefinition>;
export type CreateAgentResponse = SingleResponse<AgentApiInsert>;
export type GetAgentResponse = SingleResponse<FullAgentDefinition>;
export type UpdateFullAgentResponse = SingleResponse<FullAgentDefinition>;
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
