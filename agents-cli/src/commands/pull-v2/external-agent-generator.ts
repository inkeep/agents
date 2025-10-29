/**
 * Deterministic external agent generator - creates TypeScript external agent files from external agent data
 */

import { 
  type CodeStyle, 
  DEFAULT_CODE_STYLE, 
  toVariableName, 
  formatString,
  formatObject 
} from './generator-utils';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Generate imports needed for an external agent
 */
export function generateExternalAgentImports(
  agentId: string,
  agentData: any,
  additionalImports: string[] = [],
  style: CodeStyle = DEFAULT_CODE_STYLE
): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import externalAgent
  imports.push(`import { externalAgent } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add any additional imports passed in
  imports.push(...additionalImports);
  
  return imports;
}

/**
 * Generate export definition for an external agent (without imports)
 */
export function generateExternalAgentExport(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  const agentVarName = toVariableName(agentId);
  
  lines.push(`export const ${agentVarName} = externalAgent({`);
  
  // Add id
  lines.push(`${indent}id: ${formatString(agentId, q)},`);
  
  // Add name if different from id
  if (agentData.name && agentData.name !== agentId) {
    lines.push(`${indent}name: ${formatString(agentData.name, q)},`);
  }
  
  // Add description
  if (agentData.description) {
    lines.push(`${indent}description: ${formatString(agentData.description, q)},`);
  }
  
  // Add baseUrl
  if (agentData.baseUrl) {
    lines.push(`${indent}baseUrl: ${formatString(agentData.baseUrl, q)},`);
  }
  
  // Add headers
  if (agentData.headers && typeof agentData.headers === 'object') {
    lines.push(`${indent}headers: ${formatObject(agentData.headers, style, 1)},`);
  }
  
  // Add authentication
  if (agentData.authentication) {
    if (typeof agentData.authentication === 'string') {
      lines.push(`${indent}authentication: ${formatString(agentData.authentication, q)},`);
    } else {
      lines.push(`${indent}authentication: ${formatObject(agentData.authentication, style, 1)},`);
    }
  }
  
  // Add timeout
  if (agentData.timeout !== undefined) {
    lines.push(`${indent}timeout: ${agentData.timeout},`);
  }
  
  // Add retries
  if (agentData.retries !== undefined) {
    lines.push(`${indent}retries: ${agentData.retries},`);
  }
  
  // Add models if present
  if (agentData.models) {
    lines.push(`${indent}models: ${formatObject(agentData.models, style, 1)},`);
  }
  
  // Add any additional properties
  const additionalProps = ['version', 'metadata', 'tags'];
  for (const prop of additionalProps) {
    if (agentData[prop] !== undefined) {
      if (typeof agentData[prop] === 'string') {
        lines.push(`${indent}${prop}: ${formatString(agentData[prop], q)},`);
      } else {
        lines.push(`${indent}${prop}: ${formatObject(agentData[prop], style, 1)},`);
      }
    }
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate complete external agent file with imports and exports
 */
export function generateExternalAgentFile(
  agentData: any,
  additionalImports: string[] = [],
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const agentId = agentData.id;
  
  const imports = generateExternalAgentImports(agentId, agentData, additionalImports, style);
  const exportDef = generateExternalAgentExport(agentId, agentData, style);
  
  const lines: string[] = [];
  
  // Add imports
  if (imports.length > 0) {
    lines.push(...imports);
    lines.push(''); // Empty line after imports
  }
  
  // Add export
  lines.push(exportDef);
  
  return lines.join('\n') + '\n';
}