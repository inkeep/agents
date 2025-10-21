/**
 * Deterministic tool generator - creates TypeScript tool files from FullProjectDefinition
 */

import {
  type CodeStyle,
  DEFAULT_CODE_STYLE,
  formatObject,
  formatString,
  formatZodSchema,
  toVariableName,
} from './generator-utils';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Convert tool ID to variable name (keep original format for weird IDs, camelCase for normal ones)
 */
function toToolVariableName(id: string): string {
  // For weird tool IDs like 'fUI2riwrBVJ6MepT8rjx0', keep as-is if already valid
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id)) {
    return id;
  }

  // For normal tool IDs like 'test-tool', convert to camelCase like other components
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Generate a tool file from tool data
 */
export function generateToolFile(
  toolId: string,
  toolData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';

  const lines: string[] = [];

  // Determine tool type and generate appropriate code
  if (toolData.config?.type === 'mcp' || toolData.mcpConfig) {
    return generateMcpTool(toolId, toolData, style);
  } else if (toolData.config?.type === 'function') {
    return generateFunctionTool(toolId, toolData, style);
  } else {
    // Fallback for unknown tool types
    return generateGenericTool(toolId, toolData, style);
  }
}

/**
 * Generate an MCP tool file
 */
function generateMcpTool(toolId: string, toolData: any, style: CodeStyle): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';

  const lines: string[] = [];

  // Import statement
  lines.push(`import { mcpTool } from ${q}@inkeep/agents-sdk${q}${semi}`);
  lines.push('');

  // Generate variable name (handle weird IDs like 'fUI2riwrBVJ6MepT8rjx0')
  const toolVarName = toToolVariableName(toolId);

  // Export the tool
  lines.push(`export const ${toolVarName} = mcpTool({`);
  lines.push(`${indent}id: ${q}${toolId}${q},`);
  lines.push(`${indent}name: ${formatString(toolData.name || toolId, q)},`);

  // Add server URL if available (handle different data structures)
  let serverUrl = null;
  if (toolData.config?.mcp?.server?.url) {
    serverUrl = toolData.config.mcp.server.url;
  } else if (toolData.mcpConfig?.serverUrl) {
    serverUrl = toolData.mcpConfig.serverUrl;
  } else if (toolData.serverUrl) {
    serverUrl = toolData.serverUrl;
  }

  if (serverUrl) {
    lines.push(`${indent}serverUrl: ${formatString(serverUrl, q)},`);
  }

  // Add transport configuration if available
  if (toolData.config?.mcp?.transport) {
    const transport = toolData.config.mcp.transport;
    lines.push(`${indent}transport: ${formatObject(transport, style, 1)},`);
  }

  // Add imageUrl if available
  if (toolData.imageUrl) {
    lines.push(`${indent}imageUrl: ${formatString(toolData.imageUrl, q)},`);
  }

  // Remove trailing comma from the last property line (but not from lines that don't have properties)
  const lastLineIndex = lines.length - 1;
  if (
    lastLineIndex >= 0 &&
    lines[lastLineIndex].includes(':') &&
    lines[lastLineIndex].endsWith(',')
  ) {
    lines[lastLineIndex] = lines[lastLineIndex].slice(0, -1);
  }

  lines.push(`})${semi}`);

  return lines.join('\n') + '\n';
}

/**
 * Generate a function tool file
 */
function generateFunctionTool(toolId: string, toolData: any, style: CodeStyle): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';

  const lines: string[] = [];

  // Import statements
  lines.push(`import { functionTool } from ${q}@inkeep/agents-sdk${q}${semi}`);

  // Add zod import if we have schema
  if (toolData.schema) {
    lines.push(`import { z } from ${q}zod${q}${semi}`);
  }

  lines.push('');

  // Generate variable name
  const toolVarName = toVariableName(toolId);

  // Export the tool
  lines.push(`export const ${toolVarName} = functionTool({`);
  lines.push(`${indent}id: ${q}${toolId}${q},`);
  lines.push(`${indent}name: ${formatString(toolData.name || toolId, q)},`);

  if (toolData.description) {
    lines.push(`${indent}description: ${formatString(toolData.description, q)},`);
  }

  // Add input schema if available
  if (toolData.schema?.parameters) {
    lines.push(`${indent}inputSchema: z.toJSONSchema(${formatZodSchema(toolData.schema.parameters, style, 1)}),`);
  }

  // Add execute function if available
  if (toolData.execute) {
    lines.push(`${indent}execute: \`${toolData.execute}\`,`);
  }

  // Add dependencies if available
  if (toolData.dependencies) {
    lines.push(`${indent}dependencies: ${formatObject(toolData.dependencies, style, 1)},`);
  }

  // Remove trailing comma from the last property line
  const lastLineIndex = lines.length - 1;
  if (
    lastLineIndex >= 0 &&
    lines[lastLineIndex].includes(':') &&
    lines[lastLineIndex].endsWith(',')
  ) {
    lines[lastLineIndex] = lines[lastLineIndex].slice(0, -1);
  }

  lines.push(`})${semi}`);

  return lines.join('\n') + '\n';
}

/**
 * Generate a generic tool (fallback)
 */
function generateGenericTool(toolId: string, toolData: any, style: CodeStyle): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';

  const lines: string[] = [];

  // Use mcpTool as fallback
  lines.push(`import { mcpTool } from ${q}@inkeep/agents-sdk${q}${semi}`);
  lines.push('');

  const toolVarName = toVariableName(toolId);

  lines.push(`export const ${toolVarName} = mcpTool({`);
  lines.push(`${indent}id: ${q}${toolId}${q},`);
  lines.push(`${indent}name: ${formatString(toolData.name || toolId, q)}`);
  lines.push(`})${semi}`);

  return lines.join('\n') + '\n';
}

// All utility functions now imported from generator-utils
