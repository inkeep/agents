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
 * Reads the current selected tools from MCP node data.
 */
export function getCurrentSelectedToolsForNode(node: {
  data: MCPNodeData;
  id: string;
}): string[] | null {
  if (node.data.tempSelectedTools !== undefined) {
    return (node.data as any).tempSelectedTools;
  }
  return null;
}

/**
 * Reads the current headers from MCP node data.
 */
export function getCurrentHeadersForNode(node: {
  data: MCPNodeData;
  id: string;
}): Record<string, string> {
  if (node.data.tempHeaders && typeof node.data.tempHeaders === 'object') {
    return (node.data as any).tempHeaders;
  }
  return {};
}

/**
 * Reads the current tool policies from MCP node data.
 */
export function getCurrentToolPoliciesForNode(node: {
  data: MCPNodeData;
  id: string;
}): Record<string, { needsApproval?: boolean }> {
  if (node.data.tempToolPolicies && typeof node.data.tempToolPolicies === 'object') {
    return (node.data as any).tempToolPolicies;
  }
  return {};
}
