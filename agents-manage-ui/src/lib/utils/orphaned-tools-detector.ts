import type { Edge, Node } from '@xyflow/react';
import { getActiveTools } from '@/app/utils/active-tools';
import type { MCPNodeData } from '@/components/agent/configuration/node-types';
import { NodeType } from '@/components/agent/configuration/node-types';
import type { MCPTool } from '@/lib/types/tools';

interface OrphanedToolsInfo {
  nodeId: string;
  nodeName: string;
  orphanedTools: string[];
}

interface OrphanedToolsDetectionResult {
  hasOrphanedTools: boolean;
  orphanedToolsByNode: OrphanedToolsInfo[];
  totalOrphanedCount: number;
}

/**
 * Simplified API that combines detection and message creation
 * Returns null if no orphaned tools found, otherwise returns the warning message
 */
export function detectOrphanedToolsAndGetWarning(
  nodes: Node[],
  agentToolConfigLookup: Record<
    string,
    Record<string, { toolId: string; toolSelection?: string[] | null }>
  >,
  toolLookup: Record<string, MCPTool>
): string | null {
  const result = detectOrphanedToolsInAgent(nodes, agentToolConfigLookup, toolLookup);
  return result.hasOrphanedTools ? createOrphanedToolsWarningMessage(result) : null;
}

/**
 * Detects orphaned tools across all MCP nodes in the agent
 * Orphaned tools are tools that were selected but are no longer available in the MCP server
 */
function detectOrphanedToolsInAgent(
  nodes: Node[],
  agentToolConfigLookup: Record<
    string,
    Record<string, { toolId: string; toolSelection?: string[] | null }>
  >,
  toolLookup: Record<string, MCPTool>
): OrphanedToolsDetectionResult {
  const orphanedToolsByNode: OrphanedToolsInfo[] = [];

  // Find all MCP nodes
  const mcpNodes = nodes.filter((node): node is Node<MCPNodeData> => node.type === NodeType.MCP);

  for (const node of mcpNodes) {
    const toolData = toolLookup[node.data.toolId];
    if (!toolData) continue; // Skip if tool data not found

    const activeTools = getActiveTools({
      availableTools: toolData.availableTools,
      activeTools: (toolData.config as any)?.mcp?.activeTools,
    });

    const selectedTools = getCurrentSelectedToolsForNode(node, agentToolConfigLookup, []);

    // Find orphaned tools for this node
    const orphanedTools =
      selectedTools && Array.isArray(selectedTools)
        ? selectedTools.filter((toolName) => !activeTools?.some((tool) => tool.name === toolName))
        : [];

    if (orphanedTools.length > 0) {
      orphanedToolsByNode.push({
        nodeId: node.data.toolId,
        nodeName: node.data.name || toolData.name || 'Unnamed MCP Server',
        orphanedTools,
      });
    }
  }

  const totalOrphanedCount = orphanedToolsByNode.reduce(
    (total, nodeInfo) => total + nodeInfo.orphanedTools.length,
    0
  );

  return {
    hasOrphanedTools: orphanedToolsByNode.length > 0,
    orphanedToolsByNode,
    totalOrphanedCount,
  };
}

/**
 * Creates a user-friendly warning message for orphaned tools
 * Assumes result.hasOrphanedTools is true (should be checked by caller)
 */
export function createOrphanedToolsWarningMessage(result: OrphanedToolsDetectionResult): string {
  const nodeCount = result.orphanedToolsByNode.length;
  const toolCount = result.totalOrphanedCount;

  if (nodeCount === 1) {
    const nodeInfo = result.orphanedToolsByNode[0];
    const toolList = nodeInfo.orphanedTools.join(', ');
    const toolText = toolCount > 1 ? 'tools' : 'tool';
    const verbText = toolCount > 1 ? 'are' : 'is';
    const pronounText = toolCount > 1 ? 'These tools' : 'This tool';

    return `The MCP server "${nodeInfo.nodeName}" has ${toolCount} selected ${toolText} that ${verbText} no longer available: ${toolList}. ${pronounText} will not be available at runtime. Please update your tool selections.`;
  }

  return `${nodeCount} MCP servers have a total of ${toolCount} selected tools that are no longer available. These orphaned tools will not be available at runtime. Please update your tool selections.`;
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
