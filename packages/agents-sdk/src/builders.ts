import type { CredentialReferenceApiInsert } from '@inkeep/agents-core';
import { z } from 'zod';
import { SubAgent } from './subAgent';
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
  props: Record<string, unknown> | z.ZodObject<any>;
}

export interface DataComponentConfig extends ComponentConfig {
  props: Record<string, unknown> | z.ZodObject<any>;
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for transfer configuration (excluding function properties)
 */
export const TransferConfigSchema = z.object({
  agent: z.instanceof(SubAgent),
  description: z.string().optional(),
});

export type AgentMcpConfig = {
  server: Tool;
  selectedTools?: string[];
  headers?: Record<string, string>;
};
// ============================================================================
// Transfer Builders
// ============================================================================

/**
 * Creates a transfer configuration for agent transfers.
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
 * const transfer = transfer(supportAgent, 'Transfer to support');
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
  targetAgent: SubAgent,
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
