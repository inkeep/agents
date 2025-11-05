/**
 * Project Generator - Generate project definitions
 *
 * Generates projects using the project() builder function from @inkeep/agents-sdk
 * Projects are the top-level organizational unit that contains Agents and shared configurations
 */

import type { ComponentRegistry, ComponentType } from '../utils/component-registry';
import {
  type CodeStyle,
  DEFAULT_STYLE,
  formatObject,
  formatString,
  generateFileContent,
  generateImport,
  removeTrailingComma,
  shouldInclude,
  toCamelCase,
} from '../utils/generator-utils';

/**
 * Generate Project Definition using project() builder function
 */
export function generateProjectDefinition(
  projectId: string,
  projectData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry
): string {
  // Validate required parameters
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('projectId is required and must be a string');
  }

  if (!projectData || typeof projectData !== 'object') {
    throw new Error(`projectData is required for project '${projectId}'`);
  }

  // Validate required project fields
  const requiredFields = ['name', 'models'];
  const missingFields = requiredFields.filter(
    (field) =>
      !projectData[field] || projectData[field] === null || projectData[field] === undefined
  );

  // Additional validation for models.base
  if (!projectData.models?.base) {
    missingFields.push('models.base');
  }

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields for project '${projectId}': ${missingFields.join(', ')}`
    );
  }

  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  const projectVarName = toCamelCase(projectId);
  const lines: string[] = [];

  lines.push(`export const ${projectVarName} = project({`);
  lines.push(`${indentation}id: ${formatString(projectId, q)},`);
  lines.push(`${indentation}name: ${formatString(projectData.name, q)},`);

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
      lines.push(
        `${indentation}${indentation}transferCountIs: ${projectData.stopWhen.transferCountIs}, // Max transfers for agents`
      );
    }

    // stepCountIs - max steps for sub-agents
    if (projectData.stopWhen.stepCountIs !== undefined) {
      lines.push(
        `${indentation}${indentation}stepCountIs: ${projectData.stopWhen.stepCountIs} // Max steps for sub-agents`
      );
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
    const agentsArray = registry ? registry.formatReferencesForCode(projectData.agents, 'agents', style, 2) : '[]';
    lines.push(`${indentation}agents: () => ${agentsArray},`);
  }

  // Tools array - project-level tools (MCP tools)
  if (shouldInclude(projectData.tools)) {
    const toolsArray = registry ? registry.formatReferencesForCode(projectData.tools, 'tools', style, 2) : '[]';
    lines.push(`${indentation}tools: () => ${toolsArray},`);
  }

  // External agents array - project-level external agents
  if (shouldInclude(projectData.externalAgents)) {
    const externalAgentsArray = registry ? registry.formatReferencesForCode(projectData.externalAgents, 'externalAgents', style, 2) : '[]';
    lines.push(`${indentation}externalAgents: () => ${externalAgentsArray},`);
  }

  // Data components array - project-level data components
  if (shouldInclude(projectData.dataComponents)) {
    const dataComponentsArray = registry ? registry.formatReferencesForCode(projectData.dataComponents, 'dataComponents', style, 2) : '[]';
    lines.push(`${indentation}dataComponents: () => ${dataComponentsArray},`);
  }

  // Artifact components array - project-level artifact components
  if (shouldInclude(projectData.artifactComponents)) {
    const artifactComponentsArray = registry ? registry.formatReferencesForCode(projectData.artifactComponents, 'artifactComponents', style, 2) : '[]';
    lines.push(`${indentation}artifactComponents: () => ${artifactComponentsArray},`);
  }

  // Credential references array - project-level credentials
  if (shouldInclude(projectData.credentialReferences)) {
    const credentialReferencesArray = registry ? registry.formatReferencesForCode(projectData.credentialReferences, 'credentials', style, 2) : '[]';
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
    const referencedComponents: Array<{ id: string; type: ComponentType }> = [];

    // agents references - handle both array and object formats
    if (projectData.agents) {
      let agentIds: string[] = [];
      if (Array.isArray(projectData.agents)) {
        agentIds = projectData.agents;
      } else if (typeof projectData.agents === 'object') {
        agentIds = Object.keys(projectData.agents);
      }
      for (const agentId of agentIds) {
        referencedComponents.push({id: agentId, type: 'agents'});
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
        let componentType: ComponentType = 'tools';
        if (registry && registry.get(toolId, 'functionTools')) {
          componentType = 'functionTools';
        } else if (registry && registry.get(toolId, 'tools')) {
          componentType = 'tools';
        }

        referencedComponents.push({ id: toolId, type: componentType });
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
        referencedComponents.push({id: extAgentId, type: 'externalAgents'});
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
        referencedComponents.push({id: dataCompId, type: 'dataComponents'});
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
        referencedComponents.push({id: artifactCompId, type: 'artifactComponents'});
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
        referencedComponents.push({id: credId, type: 'credentials'});
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
