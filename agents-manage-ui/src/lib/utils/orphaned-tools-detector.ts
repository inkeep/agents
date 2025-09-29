import type { Node } from '@xyflow/react';
import { getActiveTools } from '@/app/utils/active-tools';
import type { MCPNodeData } from '@/components/graph/configuration/node-types';
import { NodeType } from '@/components/graph/configuration/node-types';
import type { MCPTool } from '@/lib/types/tools';

export interface OrphanedToolsInfo {
  nodeId: string;
  nodeName: string;
  orphanedTools: string[];
}

export interface OrphanedToolsDetectionResult {
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
  selectedToolsLookup: Record<string, Record<string, string[]>>,
  toolLookup: Record<string, MCPTool>
): string | null {
  const result = detectOrphanedToolsInGraph(nodes, selectedToolsLookup, toolLookup);
  return result.hasOrphanedTools ? createOrphanedToolsWarningMessage(result) : null;
}

/**
 * Extract shared logic for getting selected tools for a node
 * This replaces the duplicated logic between detector and MCP node editor
 */
export function getCurrentSelectedToolsForNode(
  node: { data: MCPNodeData },
  selectedToolsLookup: Record<string, Record<string, string[]>>
): string[] | null {
  // First check if we have temporary selections stored on the node (from recent clicks)
  if ((node.data as any).tempSelectedTools !== undefined) {
    return (node.data as any).tempSelectedTools;
  }

  // Otherwise, get from the database/initial state
  const allSelectedTools = new Set<string>();
  let hasAnyData = false;
  let hasEmptyArray = false;
  let hasNullValue = false;

  Object.values(selectedToolsLookup).forEach((agentTools) => {
    const toolsForThisMCP = agentTools[node.data.toolId];
    if (toolsForThisMCP !== undefined) {
      hasAnyData = true;
      if (Array.isArray(toolsForThisMCP) && toolsForThisMCP.length === 0) {
        hasEmptyArray = true;
      } else if (toolsForThisMCP === null) {
        hasNullValue = true;
      } else if (Array.isArray(toolsForThisMCP)) {
        toolsForThisMCP.forEach((tool) => {
          allSelectedTools.add(tool);
        });
      }
    }
  });

  if (hasNullValue) return null;
  if (hasEmptyArray) return [];
  if (!hasAnyData) return null;

  return Array.from(allSelectedTools);
}

/**
 * Detects orphaned tools across all MCP nodes in the graph
 * Orphaned tools are tools that were selected but are no longer available in the MCP server
 */
export function detectOrphanedToolsInGraph(
  nodes: Node[],
  selectedToolsLookup: Record<string, Record<string, string[]>>,
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
      activeTools: toolData.config?.mcp?.activeTools,
    });

    const selectedTools = getCurrentSelectedToolsForNode(node, selectedToolsLookup);

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
