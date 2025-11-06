/**
 * External Agent Generator - Generate external agent definitions
 *
 * Generates external agents using the externalAgent() builder function from @inkeep/agents-sdk
 * External agents are agents hosted on other systems that can be called by internal agents
 */

import type { ComponentRegistry, ComponentType } from '../utils/component-registry';
import {
  type CodeStyle,
  DEFAULT_STYLE,
  formatString,
  generateFileContent,
  generateImport,
  removeTrailingComma,
  toCamelCase,
} from '../utils/generator-utils';

/**
 * Generate External Agent Definition using externalAgent() builder function
 */
export function generateExternalAgentDefinition(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string {
  // Validate required parameters
  if (!agentId || typeof agentId !== 'string') {
    throw new Error('agentId is required and must be a string');
  }

  if (!agentData || typeof agentData !== 'object') {
    throw new Error(`agentData is required for external agent '${agentId}'`);
  }

  // Validate required external agent fields
  const requiredFields = ['name', 'description', 'baseUrl'];
  const missingFields = requiredFields.filter(
    (field) => !agentData[field] || agentData[field] === null || agentData[field] === undefined
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for external agent '${agentId}': ${missingFields.join(', ')}`
    );
  }

  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  let agentVarName = toCamelCase(agentId);

  // Use registry to get collision-safe variable name if available
  if (registry) {
    const registryVarName = registry.getVariableName(agentId, 'externalAgent');
    if (registryVarName) {
      agentVarName = registryVarName;
    }
  }

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
    if (typeof agentData.credentialReference === 'string') {
      if (!registry) {
        throw new Error('Registry is required for credentialReference generation');
      }

      // Reference to a credential variable - use registry
      const credentialVar = registry.getVariableName(agentData.credentialReference, 'credential');

      if (!credentialVar) {
        throw new Error(
          `Failed to resolve variable name for credential reference: ${agentData.credentialReference}`
        );
      }

      lines.push(`${indentation}credentialReference: ${credentialVar},`);
    } else if (typeof agentData.credentialReference === 'object') {
      // Inline credential reference object
      const credLines: string[] = [];
      if (agentData.credentialReference.id) {
        credLines.push(
          `${indentation}${indentation}id: ${formatString(agentData.credentialReference.id, q)},`
        );
      }
      if (agentData.credentialReference.name) {
        credLines.push(
          `${indentation}${indentation}name: ${formatString(agentData.credentialReference.name, q)},`
        );
      }
      if (agentData.credentialReference.description) {
        credLines.push(
          `${indentation}${indentation}description: ${formatString(agentData.credentialReference.description, q)},`
        );
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
  if (agentData.credentialReference && typeof agentData.credentialReference === 'string') {
    if (!registry) {
      throw new Error('Registry is required for credential reference imports');
    }

    const currentFilePath = `external-agents/${agentId}.ts`;
    const credentialRefs = [
      { id: agentData.credentialReference, type: 'credential' as ComponentType },
    ];

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
