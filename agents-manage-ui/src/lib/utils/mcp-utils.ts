import type { MCPTool } from "@/lib/types/tools";;

/**
 * Parses an MCP tool name to extract the type and name components.
 * Tool names are expected to be in the format "type::name".
 *
 * @param tool - The MCP tool object
 * @returns Object containing the parsed type and name
 *
 * @example
 * const tool = { name: "gmail::send_email", ... };
 * const { type, name } = getToolTypeAndName(tool);
 * // type: "gmail", name: "send_email"
 */
export const getToolTypeAndName = (tool: MCPTool) => {
  const [type, name] = tool.name.split('::');
  return { type, name };
};
