/**
 * External Agent Generator - Generate external agent definitions
 * 
 * Generates external agents using the externalAgent() builder function from @inkeep/agents-sdk
 * External agents are agents hosted on other systems that can be called by internal agents
 */

import {
  CodeStyle,
  DEFAULT_STYLE,
  toCamelCase,
  formatString,
  removeTrailingComma,
  generateImport,
  generateFileContent
} from '../utils/generator-utils';
import type { ComponentRegistry } from '../utils/component-registry';

/**
 * Generate External Agent Definition using externalAgent() builder function
 */
export function generateExternalAgentDefinition(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const agentVarName = toCamelCase(agentId);
  const lines: string[] = [];
  
  lines.push(`export const ${agentVarName} = externalAgent({`);
  lines.push(`${indentation}id: ${formatString(agentId, q)},`);
  
  // Name is required
  if (agentData.name !== undefined && agentData.name !== null) {
    lines.push(`${indentation}name: ${formatString(agentData.name, q)},`);
  } else {
    // Use agent ID as fallback name
    lines.push(`${indentation}name: ${formatString(agentId, q)},`);
  }
  
  // Description is required
  if (agentData.description !== undefined && agentData.description !== null) {
    lines.push(`${indentation}description: ${formatString(agentData.description, q, true)},`);
  } else {
    // Use default description if not provided
    lines.push(`${indentation}description: ${formatString(`External agent ${agentId}`, q)},`);
  }
  
  // BaseUrl is required
  if (agentData.baseUrl !== undefined && agentData.baseUrl !== null) {
    lines.push(`${indentation}baseUrl: ${formatString(agentData.baseUrl, q)},`);
  }
  
  // Optional credential reference
  if (agentData.credentialReference) {
    if (typeof agentData.credentialReference === 'string' && registry) {
      // Reference to a credential variable - use registry
      const credentialVar = registry.getVariableName(agentData.credentialReference);
      lines.push(`${indentation}credentialReference: ${credentialVar},`);
    } else if (typeof agentData.credentialReference === 'object') {
      // Inline credential reference object
      const credLines: string[] = [];
      if (agentData.credentialReference.id) {
        credLines.push(`${indentation}${indentation}id: ${formatString(agentData.credentialReference.id, q)},`);
      }
      if (agentData.credentialReference.name) {
        credLines.push(`${indentation}${indentation}name: ${formatString(agentData.credentialReference.name, q)},`);
      }
      if (agentData.credentialReference.description) {
        credLines.push(`${indentation}${indentation}description: ${formatString(agentData.credentialReference.description, q)},`);
      }
      // Remove trailing comma from last credential property
      if (credLines.length > 0 && credLines[credLines.length - 1].endsWith(',')) {
        credLines[credLines.length - 1] = credLines[credLines.length - 1].slice(0, -1);
      }
      
      lines.push(`${indentation}credentialReference: {`);
      lines.push(...credLines);
      lines.push(`${indentation}},`);
    }
  }
  
  // Remove trailing comma from last line
  removeTrailingComma(lines);
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate imports needed for an external agent file
 */
export function generateExternalAgentImports(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string[] {
  const imports: string[] = [];
  
  // Always import externalAgent from SDK
  imports.push(generateImport(['externalAgent'], '@inkeep/agents-sdk', style));
  
  // Generate imports for referenced components if registry is available
  if (registry && agentData.credentialReference && typeof agentData.credentialReference === 'string') {
    const currentFilePath = `external-agents/${agentId}.ts`;
    const credentialRefs = [agentData.credentialReference];
    
    // Get import statements for referenced credentials
    const componentImports = registry.getImportsForFile(currentFilePath, credentialRefs);
    imports.push(...componentImports);
  }
  
  return imports;
}

/**
 * Generate complete external agent file (imports + definition)
 */
export function generateExternalAgentFile(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string {
  const imports = generateExternalAgentImports(agentId, agentData, style, registry);
  const definition = generateExternalAgentDefinition(agentId, agentData, style, registry);
  
  return generateFileContent(imports, [definition]);
}