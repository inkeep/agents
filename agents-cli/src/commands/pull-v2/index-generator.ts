/**
 * Deterministic index generator - creates the main index.ts file from FullProjectDefinition
 */

import { 
  type CodeStyle, 
  DEFAULT_CODE_STYLE, 
  formatString,
  formatObject,
  type ComponentType 
} from './generator-utils';
import type { FullProjectDefinition } from '@inkeep/agents-core';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Generate the main index.ts file for the project
 */
export function generateIndexFile(
  project: FullProjectDefinition,
  componentNameMap: Map<string, { name: string; type: ComponentType }>,
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Import project function
  lines.push(`import { project } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Import agents
  const agentImports: string[] = [];
  if (project.agents && Object.keys(project.agents).length > 0) {
    for (const agentId of Object.keys(project.agents)) {
      const agentInfo = componentNameMap.get(`agent:${agentId}`);
      if (!agentInfo) {
        throw new Error(`Agent ${agentId} not found in component name map`);
      }
      const agentVarName = agentInfo.name;
      const agentFileName = toFileName(agentId);
      agentImports.push(`import { ${agentVarName} } from ${q}./agents/${agentFileName}${q}${semi}`);
    }
  }
  
  if (agentImports.length > 0) {
    lines.push(...agentImports);
  }
  
  lines.push('');
  
  // Generate project variable name
  const projectInfo = componentNameMap.get(`project:${project.id}`);
  if (!projectInfo) {
    throw new Error(`Project ${project.id} not found in component name map`);
  }
  const projectVarName = projectInfo.name;
  
  // Export the project
  lines.push(`export const ${projectVarName} = project({`);
  lines.push(`${indent}id: ${q}${project.id}${q},`);
  lines.push(`${indent}name: ${formatString(project.name, q)},`);
  
  if (project.description) {
    lines.push(`${indent}description: ${formatString(project.description, q)},`);
  }
  
  // Add models configuration
  if (project.models) {
    lines.push(`${indent}models: ${formatObject(project.models, style, 1)},`);
  }
  
  // Only add stopWhen if explicitly defined in the project
  if (project.stopWhen !== undefined) {
    if (project.stopWhen === null) {
      lines.push(`${indent}stopWhen: null,`);
    } else {
      lines.push(`${indent}stopWhen: ${JSON.stringify(project.stopWhen)},`);
    }
  }
  
  // Add agents array (should be a function that returns an array)
  if (project.agents && Object.keys(project.agents).length > 0) {
    lines.push(`${indent}agents: () => [`);
    for (const agentId of Object.keys(project.agents)) {
      const agentInfo = componentNameMap.get(`agent:${agentId}`);
      if (!agentInfo) {
        throw new Error(`Agent ${agentId} not found in component name map`);
      }
      const agentVarName = agentInfo.name;
      lines.push(`${indent}${indent}${agentVarName},`);
    }
    lines.push(`${indent}]`);
  } else {
    lines.push(`${indent}agents: () => []`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Generate a simple index.ts that just exports the project
 */
export function generateSimpleIndexFile(
  projectId: string,
  projectName: string,
  agentIds: string[],
  style: CodeStyle = DEFAULT_CODE_STYLE
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Import project function
  lines.push(`import { project } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Import agents
  if (agentIds.length > 0) {
    for (const agentId of agentIds) {
      const agentVarName = toAgentVariableName(agentId);
      const agentFileName = toFileName(agentId);
      lines.push(`import { ${agentVarName} } from ${q}./agents/${agentFileName}${q}${semi}`);
    }
  }
  
  lines.push('');
  
  // Generate project variable name
  const projectVarName = toProjectVariableName(projectId);
  
  // Export the project
  lines.push(`export const ${projectVarName} = project({`);
  lines.push(`${indent}id: ${q}${projectId}${q},`);
  lines.push(`${indent}name: ${formatString(projectName, q)},`);
  
  // Add agents array
  if (agentIds.length > 0) {
    lines.push(`${indent}agents: [`);
    for (const agentId of agentIds) {
      const agentVarName = toAgentVariableName(agentId);
      lines.push(`${indent}${indent}${agentVarName},`);
    }
    lines.push(`${indent}]`);
  } else {
    lines.push(`${indent}agents: []`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Convert project ID to camelCase variable name
 */
function toProjectVariableName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Convert agent ID to camelCase variable name
 */
function toAgentVariableName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Convert ID to kebab-case file name
 */
function toFileName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}