/**
 * MCP Tool Generator - Generate MCP tool definitions
 * 
 * Generates MCP tools using the mcpTool() builder function from @inkeep/agents-sdk
 * MCP tools connect to external MCP servers and can have credentials and configurations
 */

interface CodeStyle {
  quotes: 'single' | 'double';
  semicolons: boolean;
  indentation: string;
}

const DEFAULT_STYLE: CodeStyle = {
  quotes: 'single',
  semicolons: true,
  indentation: '  ',
};

/**
 * Utility functions
 */
function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

function formatString(str: string, quote: string = "'", multiline: boolean = false): string {
  if (!str) return `${quote}${quote}`;
  
  if (multiline && (str.includes('\n') || str.length > 80)) {
    // Use template literal for multiline strings
    return `\`${str.replace(/`/g, '\\`')}\``;
  }
  
  return `${quote}${str.replace(new RegExp(quote, 'g'), '\\' + quote)}${quote}`;
}

/**
 * Generate MCP Tool Definition using mcpTool() builder function
 */
export function generateMcpToolDefinition(
  toolId: string,
  toolData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: any
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const toolVarName = toCamelCase(toolId);
  const lines: string[] = [];
  
  lines.push(`export const ${toolVarName} = mcpTool({`);
  lines.push(`${indentation}id: ${formatString(toolId, q)},`);
  
  // Name is required for MCP tools
  if (toolData.name) {
    lines.push(`${indentation}name: ${formatString(toolData.name, q)},`);
  } else {
    // Use tool ID as fallback name
    lines.push(`${indentation}name: ${formatString(toolId, q)},`);
  }
  
  // Server URL - extract from config.mcp.server.url
  const serverUrl = toolData.config?.mcp?.server?.url || toolData.serverUrl;
  if (serverUrl) {
    lines.push(`${indentation}serverUrl: ${formatString(serverUrl, q)},`);
  }
  
  if (toolData.description) {
    lines.push(`${indentation}description: ${formatString(toolData.description, q, true)},`);
  }
  
  // Optional imageUrl for tool icon
  if (toolData.imageUrl) {
    lines.push(`${indentation}imageUrl: ${formatString(toolData.imageUrl, q)},`);
  }
  
  // Optional headers object
  if (toolData.headers && typeof toolData.headers === 'object') {
    const headersStr = JSON.stringify(toolData.headers, null, 2);
    const formattedHeaders = headersStr.split('\n').map((line, index) => {
      if (index === 0) return `${indentation}headers: ${line}`;
      return `${indentation}${line}`;
    }).join('\n');
    lines.push(formattedHeaders + ',');
  }
  
  // Handle credentials - support direct references and credential IDs
  if (toolData.credential) {
    // Direct credential reference (e.g., envSettings.getEnvironmentCredential('key'))
    if (typeof toolData.credential === 'object') {
      const credentialStr = JSON.stringify(toolData.credential);
      lines.push(`${indentation}credential: ${credentialStr},`);
    } else {
      // Assume it's a direct reference that should be output as-is
      lines.push(`${indentation}credential: ${toolData.credential},`);
    }
  } else if (toolData.credentialReferenceId && registry) {
    // Generate credential reference via registry
    const validKey = registry.getVariableName(toolData.credentialReferenceId, 'credential');
    lines.push(`${indentation}credential: envSettings.getEnvironmentCredential(${formatString(validKey, q)}),`);
  }
  
  // Remove trailing comma from last line
  if (lines.length > 0 && lines[lines.length - 1].endsWith(',')) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate imports needed for an MCP tool file
 */
export function generateMcpToolImports(
  toolId: string,
  toolData: any,
  style: CodeStyle = DEFAULT_STYLE
): string[] {
  const { quotes, semicolons } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import mcpTool from SDK
  imports.push(`import { mcpTool } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add environment settings import if using credential references
  if (toolData.credentialReferenceId) {
    imports.push(`import { envSettings } from ${q}../environments${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate complete MCP tool file (imports + definition)
 */
export function generateMcpToolFile(
  toolId: string,
  toolData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: any
): string {
  const imports = generateMcpToolImports(toolId, toolData, style);
  const definition = generateMcpToolDefinition(toolId, toolData, style, registry);
  
  return imports.join('\n') + '\n\n' + definition + '\n';
}