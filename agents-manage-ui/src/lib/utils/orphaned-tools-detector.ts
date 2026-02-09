import type { Edge } from '@xyflow/react';
import type { MCPNodeData } from '@/components/agent/configuration/node-types';

export interface ActiveTool {
  name: string;
  description?: string;
}

/**
 * Finds orphaned tools - tools that are selected but no longer available in activeTools
 */
export function findOrphanedTools(
  selectedTools: string[] | null,
  activeTools: ActiveTool[] | undefined
): string[] {
  if (!selectedTools || !Array.isArray(selectedTools)) {
    return [];
  }
  return selectedTools.filter((toolName) => !activeTools?.some((tool) => tool.name === toolName));
}

/**
 * Enhanced lookup for selected tools - uses relationshipId for true isolation
 */
export function getCurrentSelectedToolsForNode(
  node: { data: MCPNodeData; id: string },
  agentToolConfigLookup: Record<
    string,
    Record<string, { toolId: string; toolSelection?: string[] | null }>
  >,
  _edges: Edge[]
): string[] | null {
  // First check if we have temporary selections stored on the node (from recent clicks)
  if ((node.data as any).tempSelectedTools !== undefined) {
    return (node.data as any).tempSelectedTools;
  }

  // If node has relationshipId, find config by relationshipId
  const relationshipId = (node.data as any).relationshipId;
  if (relationshipId) {
    for (const toolsMap of Object.values(agentToolConfigLookup)) {
      const config = toolsMap[relationshipId];
      if (config) {
        return config.toolSelection || null;
      }
    }
  }

  // No relationshipId found, return null (show all tools selected)
  return null;
}

/**
 * Enhanced lookup for headers - uses relationshipId
 */
export function getCurrentHeadersForNode(
  node: { data: MCPNodeData; id: string },
  agentToolConfigLookup: Record<
    string,
    Record<string, { toolId: string; headers?: Record<string, string> }>
  >,
  _edges: Edge[]
): Record<string, string> {
  // First check if we have temporary headers stored on the node (from recent edits)
  if ((node.data as any).tempHeaders !== undefined) {
    return (node.data as any).tempHeaders;
  }

  // If node has relationshipId, find config by relationshipId
  const relationshipId = (node.data as any).relationshipId;
  if (relationshipId) {
    for (const toolsMap of Object.values(agentToolConfigLookup)) {
      const config = toolsMap[relationshipId];
      if (config) {
        return config.headers || {};
      }
    }
  }

  // No relationshipId found, return empty headers
  return {};
}

/**
 * Enhanced lookup for toolPolicies - uses relationshipId
 */
export function getCurrentToolPoliciesForNode(
  node: { data: MCPNodeData; id: string },
  agentToolConfigLookup: Record<
    string,
    Record<string, { toolId: string; toolPolicies?: Record<string, { needsApproval?: boolean }> }>
  >,
  _edges: Edge[]
): Record<string, { needsApproval?: boolean }> {
  // First check if we have temporary toolPolicies stored on the node (from recent edits)
  if ((node.data as any).tempToolPolicies !== undefined) {
    return (node.data as any).tempToolPolicies;
  }

  // If node has relationshipId, find config by relationshipId
  const relationshipId = (node.data as any).relationshipId;
  if (relationshipId) {
    for (const toolsMap of Object.values(agentToolConfigLookup)) {
      const config = toolsMap[relationshipId];
      if (config) {
        return config.toolPolicies || {};
      }
    }
  }

  // No relationshipId found, default to empty object
  return {};
}
