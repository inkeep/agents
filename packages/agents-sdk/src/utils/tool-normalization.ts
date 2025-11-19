import type { ToolPolicy } from '@inkeep/agents-core';
import type { AgentMcpConfig } from '../builders';
import type { Tool } from '../tool';
import type { SubAgentCanUseType } from '../types';

/**
 * Type guard to check if a value is an AgentMcpConfig
 */
export function isAgentMcpConfig(value: unknown): value is AgentMcpConfig {
  return (
    value !== null &&
    typeof value === 'object' &&
    'server' in value &&
    (value as any).server &&
    typeof (value as any).server === 'object'
  );
}

/**
 * Type guard to check if a value is a Tool instance
 */
export function isTool(value: unknown): value is Tool {
  return (
    value !== null &&
    typeof value === 'object' &&
    'config' in value &&
    (typeof (value as any).getId === 'function' || 'id' in value)
  );
}

/**
 * Type guard to narrow down AgentCanUseType
 */
export function isAgentCanUseType(value: unknown): value is SubAgentCanUseType {
  return isAgentMcpConfig(value) || isTool(value);
}

/**
 * Normalized tool representation with proper typing
 */
export interface NormalizedToolInfo {
  /** The underlying Tool instance */
  tool: Tool;
  /** The tool ID */
  toolId: string;
  /** Selected tools (only present for AgentMcpConfig) */
  selectedTools?: string[];
  /** Agent-specific headers (only present for AgentMcpConfig) */
  headers?: Record<string, string>;
  /** Per-tool policies like needsApproval (only present for AgentMcpConfig) */
  toolPolicies?: Record<string, ToolPolicy>;
  /** Whether this came from an AgentMcpConfig wrapper */
  isWrapped: boolean;
}

/**
 * Safely extracts tool information from AgentCanUseType with proper typing
 */
export function normalizeAgentCanUseType(
  value: SubAgentCanUseType,
  fallbackName?: string
): NormalizedToolInfo {
  if (isAgentMcpConfig(value)) {
    return {
      tool: value.server,
      toolId: value.server.getId(),
      selectedTools: value.selectedTools,
      headers: value.headers,
      toolPolicies: value.toolPolicies,
      isWrapped: true,
    };
  }

  if (isTool(value)) {
    const toolId = value.getId?.() || (value as any).id || fallbackName || 'unknown';
    return {
      tool: value,
      toolId,
      isWrapped: false,
    };
  }

  throw new Error(`Invalid AgentCanUseType: expected Tool or AgentMcpConfig, got ${typeof value}`);
}
