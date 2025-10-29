/**
 * Project Generator - Generate project definitions
 * 
 * Generates projects using the project() builder function from @inkeep/agents-sdk
 * Projects are the top-level organizational unit that contains Agents and shared configurations
 */

import {
  CodeStyle,
  DEFAULT_STYLE,
  toCamelCase,
  formatString,
  formatObject,
  removeTrailingComma,
  generateImport,
  generateFileContent,
  shouldInclude
} from '../utils/generator-utils';
import type { ComponentRegistry, ComponentType } from '../utils/component-registry';

/**
 * Generate Project Definition using project() builder function
 */
export function generateProjectDefinition(
  projectId: string,
  projectData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';
  
  const projectVarName = toCamelCase(projectId);
  const lines: string[] = [];
  
  lines.push(`export const ${projectVarName} = project({`);
  lines.push(`${indentation}id: ${formatString(projectId, q)},`);
  
  // Name is required
  if (projectData.name !== undefined && projectData.name !== null) {
    lines.push(`${indentation}name: ${formatString(projectData.name, q)},`);
  } else {
    // Use project ID as fallback name
    lines.push(`${indentation}name: ${formatString(projectId, q)},`);
  }
  
  // Description is optional
  if (shouldInclude(projectData.description)) {
    lines.push(`${indentation}description: ${formatString(projectData.description, q, true)},`);
  }
  
  // Models configuration
  if (shouldInclude(projectData.models)) {
    lines.push(`${indentation}models: ${formatObject(projectData.models, style, 2)},`);
  }
  
  // stopWhen configuration - project-level limits
  if (shouldInclude(projectData.stopWhen)) {
    lines.push(`${indentation}stopWhen: {`);
    
    // transferCountIs - max transfers for agents
    if (projectData.stopWhen.transferCountIs !== undefined) {
      lines.push(`${indentation}${indentation}transferCountIs: ${projectData.stopWhen.transferCountIs}, // Max transfers for agents`);
    }
    
    // stepCountIs - max steps for sub-agents
    if (projectData.stopWhen.stepCountIs !== undefined) {
      lines.push(`${indentation}${indentation}stepCountIs: ${projectData.stopWhen.stepCountIs} // Max steps for sub-agents`);
    }
    
    // Remove trailing comma from stopWhen (handle lines with comments)
    if (lines.length > 1) {
      const lastLine = lines[lines.length - 1];
      // Look for comma before comment or at end of line
      if (lastLine.includes(',') && (lastLine.includes('//') || lastLine.endsWith(','))) {
        if (lastLine.includes('//')) {
          // Remove comma before comment
          lines[lines.length - 1] = lastLine.replace(', //', ' //');
        } else {
          // Remove trailing comma
          lines[lines.length - 1] = lastLine.slice(0, -1);
        }
      }
    }
    
    lines.push(`${indentation}},`);
  }
  
  // Agents array - function that returns agents
  if (shouldInclude(projectData.agents)) {
    const agentsArray = registry ? registry.formatReferencesForCode(projectData.agents, 'agent', style, 2) : '[]';
    lines.push(`${indentation}agents: () => ${agentsArray},`);
  }
  
  // Tools array - project-level tools (MCP tools)
  if (shouldInclude(projectData.tools)) {
    const toolsArray = registry ? registry.formatReferencesForCode(projectData.tools, 'tool', style, 2) : '[]';
    lines.push(`${indentation}tools: () => ${toolsArray},`);
  }
  
  // External agents array - project-level external agents
  if (shouldInclude(projectData.externalAgents)) {
    const externalAgentsArray = registry ? registry.formatReferencesForCode(projectData.externalAgents, 'externalAgent', style, 2) : '[]';
    lines.push(`${indentation}externalAgents: () => ${externalAgentsArray},`);
  }
  
  // Data components array - project-level data components
  if (shouldInclude(projectData.dataComponents)) {
    const dataComponentsArray = registry ? registry.formatReferencesForCode(projectData.dataComponents, 'dataComponent', style, 2) : '[]';
    lines.push(`${indentation}dataComponents: () => ${dataComponentsArray},`);
  }
  
  // Artifact components array - project-level artifact components
  if (shouldInclude(projectData.artifactComponents)) {
    const artifactComponentsArray = registry ? registry.formatReferencesForCode(projectData.artifactComponents, 'artifactComponent', style, 2) : '[]';
    lines.push(`${indentation}artifactComponents: () => ${artifactComponentsArray},`);
  }
  
  // Credential references array - project-level credentials
  if (shouldInclude(projectData.credentialReferences)) {
    const credentialReferencesArray = registry ? registry.formatReferencesForCode(projectData.credentialReferences, 'credential', style, 2) : '[]';
    lines.push(`${indentation}credentialReferences: () => ${credentialReferencesArray},`);
  }
  
  // Remove trailing comma from last line
  removeTrailingComma(lines);
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate imports needed for a project file
 */
export function generateProjectImports(
  projectId: string,
  projectData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string[] {
  const imports: string[] = [];
  
  // Always import project from SDK
  imports.push(generateImport(['project'], '@inkeep/agents-sdk', style));
  
  // Generate imports for referenced components if registry is available
  if (registry) {
    const currentFilePath = 'index.ts';
    
    // Build typed component references based on project data structure  
    const referencedComponents: Array<{id: string, type: ComponentType}> = [];
    
    // agents references - handle both array and object formats
    if (projectData.agents) {
      let agentIds: string[] = [];
      if (Array.isArray(projectData.agents)) {
        agentIds = projectData.agents;
      } else if (typeof projectData.agents === 'object') {
        agentIds = Object.keys(projectData.agents);
      }
      for (const agentId of agentIds) {
        referencedComponents.push({id: agentId, type: 'agent'});
      }
    }
    
    // tools references - handle both array and object formats
    if (projectData.tools) {
      let toolIds: string[] = [];
      if (Array.isArray(projectData.tools)) {
        toolIds = projectData.tools;
      } else if (typeof projectData.tools === 'object') {
        toolIds = Object.keys(projectData.tools);
      }
      for (const toolId of toolIds) {
        // Determine the actual component type by checking what's in the registry
        let componentType: ComponentType = 'tool';
        if (registry && registry.get(toolId, 'functionTool')) {
          componentType = 'functionTool';
        } else if (registry && registry.get(toolId, 'tool')) {
          componentType = 'tool';
        }
        
        referencedComponents.push({id: toolId, type: componentType});
      }
    }
    
    // externalAgents references - handle both array and object formats
    if (projectData.externalAgents) {
      let extAgentIds: string[] = [];
      if (Array.isArray(projectData.externalAgents)) {
        extAgentIds = projectData.externalAgents;
      } else if (typeof projectData.externalAgents === 'object') {
        extAgentIds = Object.keys(projectData.externalAgents);
      }
      for (const extAgentId of extAgentIds) {
        referencedComponents.push({id: extAgentId, type: 'externalAgent'});
      }
    }
    
    // dataComponents references - handle both array and object formats
    if (projectData.dataComponents) {
      let dataCompIds: string[] = [];
      if (Array.isArray(projectData.dataComponents)) {
        dataCompIds = projectData.dataComponents;
      } else if (typeof projectData.dataComponents === 'object') {
        dataCompIds = Object.keys(projectData.dataComponents);
      }
      for (const dataCompId of dataCompIds) {
        referencedComponents.push({id: dataCompId, type: 'dataComponent'});
      }
    }
    
    // artifactComponents references - handle both array and object formats
    if (projectData.artifactComponents) {
      let artifactCompIds: string[] = [];
      if (Array.isArray(projectData.artifactComponents)) {
        artifactCompIds = projectData.artifactComponents;
      } else if (typeof projectData.artifactComponents === 'object') {
        artifactCompIds = Object.keys(projectData.artifactComponents);
      }
      for (const artifactCompId of artifactCompIds) {
        referencedComponents.push({id: artifactCompId, type: 'artifactComponent'});
      }
    }
    
    // credentialReferences - handle both array and object formats
    if (projectData.credentialReferences) {
      let credIds: string[] = [];
      if (Array.isArray(projectData.credentialReferences)) {
        credIds = projectData.credentialReferences;
      } else if (typeof projectData.credentialReferences === 'object') {
        credIds = Object.keys(projectData.credentialReferences);
      }
      for (const credId of credIds) {
        referencedComponents.push({id: credId, type: 'credential'});
      }
    }
    
    // Get import statements for all referenced components
    if (referencedComponents.length > 0) {
      const componentImports = registry.getImportsForFile(currentFilePath, referencedComponents);
      imports.push(...componentImports);
    }
  }
  
  return imports;
}

/**
 * Generate complete project file (imports + definition)
 */
export function generateProjectFile(
  projectId: string,
  projectData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string {
  const imports = generateProjectImports(projectId, projectData, style, registry);
  const definition = generateProjectDefinition(projectId, projectData, style, registry);
  
  return generateFileContent(imports, [definition]);
}