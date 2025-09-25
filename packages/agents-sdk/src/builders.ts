import type { CredentialReferenceApiInsert, } from '@inkeep/agents-core';
import { z } from 'zod';
import { Agent } from './agent';
import type { Tool } from './tool';
import type { TransferConfig } from './types';
import { validateFunction } from './utils/validateFunction';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Function signature for tool execution
 * @template TParams - Type of input parameters
 * @template TResult - Type of return value
 */
export type ToolExecuteFunction<TParams = unknown, TResult = unknown> = (
  params: TParams
) => Promise<TResult>;

/**
 * Function signature for transfer conditions
 */
export type TransferConditionFunction = (context: unknown) => boolean;

/**
 * Configuration for MCP server builders
 */
export interface MCPServerConfig {
  // Basic configuration
  name: string;
  description: string;

  // Remote server configuration
  serverUrl: string;

  // Optional configuration
  id?: string;
  parameters?: Record<string, z.ZodJSONSchema>;
  credential?: CredentialReferenceApiInsert;
  transport?: 'streamable_http' | 'sse';
  activeTools?: string[];
  headers?: Record<string, string>;
  imageUrl?: string;
}

/**
 * Configuration for component builders
 */
export interface ComponentConfig {
  id?: string;
  name: string;
  description: string;
}

export interface ArtifactComponentConfig extends ComponentConfig {
  summaryProps: Record<string, unknown>;
  fullProps: Record<string, unknown>;
}

export interface DataComponentConfig extends ComponentConfig {
  props: Record<string, unknown>;
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for transfer configuration (excluding function properties)
 */
export const TransferConfigSchema = z.object({
  agent: z.instanceof(Agent),
  description: z.string().optional(),
});

export type AgentMcpConfig = {
  server: Tool;
  selectedTools: string[];
};
// ============================================================================
// Transfer Builders
// ============================================================================

/**
 * Creates a transfer configuration for agent handoffs.
 *
 * Transfers allow one agent to hand off control to another agent
 * based on optional conditions.
 *
 * @param targetAgent - The agent to transfer to
 * @param description - Optional description of when/why to transfer
 * @param condition - Optional function to determine if transfer should occur
 * @returns A validated transfer configuration
 *
 * @example
 * ```typescript
 * // Simple transfer
 * const handoff = transfer(supportAgent, 'Transfer to support');
 *
 * // Conditional transfer
 * const conditionalHandoff = transfer(
 *   specialistAgent,
 *   'Transfer to specialist for complex issues',
 *   (context) => context.complexity > 0.8
 * );
 * ```
 */
export function transfer(
  targetAgent: Agent,
  description?: string,
  condition?: TransferConditionFunction
): TransferConfig {
  // Validate function if provided
  if (condition !== undefined) {
    validateFunction(condition, 'condition');
  }

  const config: TransferConfig = {
    agent: targetAgent,
    description: description || `Hand off to ${targetAgent.getName()}`,
    condition,
  };

  // Validate non-function properties
  TransferConfigSchema.parse({
    agent: config.agent,
    description: config.description,
  });

  return config;
}
