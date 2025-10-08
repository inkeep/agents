import type { MCPTool } from '@/lib/types/tools';

/**
 * Gets the active tools for an MCP server.
 * - If no active tools are configured (undefined), returns all available tools
 * - If active tools are configured as an array, returns only the tools that are in the active list
 */
export function getActiveTools({
  availableTools,
  activeTools,
}: {
  availableTools: MCPTool['availableTools'];
  activeTools: string[] | undefined;
}): MCPTool['availableTools'] | undefined {
  if (!availableTools) return undefined;

  // If no activeTools configured (undefined), return all available tools
  if (!activeTools) {
    return availableTools;
  }

  // Return filtered tools based on activeTools configuration
  return availableTools.filter((tool) => activeTools.includes(tool.name));
}
