/**
 * Agent Generator - Generate top-level agent definitions
 *
 * Generates top-level agents using the agent() builder function from @inkeep/agents-sdk
 * Top-level agents are the main entry points that handle statusUpdates with statusComponents
 */

import type { ComponentRegistry, ComponentType } from '../utils/component-registry';
import {
  type CodeStyle,
  DEFAULT_STYLE,
  formatPromptWithContext,
  formatString,
  generateFileContent,
  generateImport,
  hasTemplateVariables,
  removeTrailingComma,
  toCamelCase,
} from '../utils/generator-utils';

/**
 * Format statusUpdates configuration with statusComponents references
 */
function formatStatusUpdates(
  statusUpdatesConfig: any,
  style: CodeStyle,
  indentLevel: number,
  registry?: ComponentRegistry,
  contextConfigData?: any,
  agentId?: string
): string {
  if (!statusUpdatesConfig) {
    return '';
  }

  const { quotes, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const indent = indentation.repeat(indentLevel);
  const lines: string[] = [];

  lines.push(`${indent}statusUpdates: {`);

  // numEvents
  if (statusUpdatesConfig.numEvents !== undefined) {
    lines.push(`${indent}${indentation}numEvents: ${statusUpdatesConfig.numEvents},`);
  }

  // timeInSeconds
  if (statusUpdatesConfig.timeInSeconds !== undefined) {
    lines.push(`${indent}${indentation}timeInSeconds: ${statusUpdatesConfig.timeInSeconds},`);
  }

  // statusComponents - array of status component config references
  if (
    statusUpdatesConfig.statusComponents &&
    Array.isArray(statusUpdatesConfig.statusComponents) &&
    statusUpdatesConfig.statusComponents.length > 0
  ) {
    const statusComponentIds = statusUpdatesConfig.statusComponents
      .map((comp: any) => {
        if (typeof comp === 'string') {
          return comp;
        } else if (typeof comp === 'object' && comp) {
          return comp.id || comp.type || comp.name;
        }
        return null;
      })
      .filter(Boolean);

    if (statusComponentIds.length > 0) {
      lines.push(`${indent}${indentation}statusComponents: [`);
      for (const statusCompId of statusComponentIds) {
        const statusCompVar = registry?.getVariableName(statusCompId, 'statusComponents');
        lines.push(`${indent}${indentation}${indentation}${statusCompVar || 'undefined'}.config,`);
      }
      lines.push(`${indent}${indentation}],`);
    }
  }

  // prompt - for status updates, use context.toTemplate() or headers.toTemplate() based on schema analysis
  if (statusUpdatesConfig.prompt) {
    if (
      hasTemplateVariables(statusUpdatesConfig.prompt) &&
      contextConfigData &&
      agentId &&
      registry
    ) {
      const contextConfigId = contextConfigData.id;
      const contextVarName = registry.getVariableName(contextConfigId, 'contextConfigs');

      if (!contextVarName) {
        throw new Error(`Failed to resolve context config variable name for: ${contextConfigId}`);
      }

      const headersVarName = 'headersSchema';
      lines.push(
        `${indent}${indentation}prompt: ${formatPromptWithContext(statusUpdatesConfig.prompt, contextVarName, headersVarName, contextConfigData, q, true)},`
      );
    } else {
      lines.push(
        `${indent}${indentation}prompt: ${formatString(statusUpdatesConfig.prompt, q, true)},`
      );
    }
  }

  // Remove trailing comma from last property
  removeTrailingComma(lines);

  lines.push(`${indent}},`);

  return lines.join('\n');
}

/**
 * Format stopWhen configuration for agents (only supports transferCountIs)
 */
function formatStopWhen(stopWhenConfig: any, style: CodeStyle, indentLevel: number): string {
  if (!stopWhenConfig || !stopWhenConfig.transferCountIs) {
    return '';
  }

  const { indentation } = style;
  const indent = indentation.repeat(indentLevel);

  return `${indent}stopWhen: {\n${indent}${indentation}transferCountIs: ${stopWhenConfig.transferCountIs} // Max transfers in one conversation\n${indent}},`;
}

/**
 * Check if agent models are different from project models
 */
function hasDistinctModels(agentModels: any, projectModels: any): boolean {
  if (!agentModels) return false;
  if (!projectModels) return !!agentModels; // Agent has models but project doesn't

  // Compare each model type
  const modelTypes = ['base', 'structuredOutput', 'summarizer'];

  for (const type of modelTypes) {
    const agentModel = agentModels[type]?.model;
    const projectModel = projectModels[type]?.model;

    // Check if models are different (including when one exists and other doesn't)
    if (agentModel !== projectModel) {
      return true;
    }

    // Check provider options (only if both models exist)
    if (agentModel && projectModel) {
      const agentOptions = agentModels[type]?.providerOptions;
      const projectOptions = projectModels[type]?.providerOptions;

      // Deep comparison for provider options
      if (agentOptions !== projectOptions) {
        if (!agentOptions && !projectOptions) {
          // Both are falsy, they're the same
          continue;
        }
        if (!agentOptions || !projectOptions) {
          // One is falsy, other isn't - they're different
          return true;
        }
        // Both exist, compare as JSON
        if (JSON.stringify(agentOptions) !== JSON.stringify(projectOptions)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Generate Agent Definition using agent() builder function
 */
export function generateAgentDefinition(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry,
  contextConfigData?: any,
  projectModels?: any
): string {
  // Validate required parameters
  if (!agentId || typeof agentId !== 'string') {
    throw new Error('agentId is required and must be a string');
  }

  if (!agentData || typeof agentData !== 'object') {
    throw new Error(`agentData is required for agent '${agentId}'`);
  }

  // Validate required agent fields
  const requiredFields = ['name', 'defaultSubAgentId', 'subAgents'];
  const missingFields = requiredFields.filter(
    (field) => !agentData[field] || agentData[field] === null || agentData[field] === undefined
  );

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields for agent '${agentId}': ${missingFields.join(', ')}`);
  }

  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  let agentVarName = toCamelCase(agentId);

  // Use registry to get collision-safe variable name if available
  if (registry) {
    const registryVarName = registry.getVariableName(agentId, 'agents');
    if (registryVarName) {
      agentVarName = registryVarName;
    }
  }

  const lines: string[] = [];

  lines.push(`export const ${agentVarName} = agent({`);
  lines.push(`${indentation}id: ${formatString(agentId, q)},`);

  // Required fields - these must be present
  lines.push(`${indentation}name: ${formatString(agentData.name, q)},`);

  if (agentData.description !== undefined && agentData.description !== null) {
    lines.push(`${indentation}description: ${formatString(agentData.description, q, true)},`);
  }

  // Prompt - main agent prompt, use context.toTemplate() or headers.toTemplate() based on schema analysis
  if (agentData.prompt !== undefined && agentData.prompt !== null) {
    if (hasTemplateVariables(agentData.prompt) && contextConfigData && registry) {
      const contextConfigId = contextConfigData.id;
      const contextVarName = registry.getVariableName(contextConfigId, 'contextConfigs');

      if (!contextVarName) {
        throw new Error(`Failed to resolve context config variable name for: ${contextConfigId}`);
      }

      const headersVarName = 'headersSchema';
      lines.push(
        `${indentation}prompt: ${formatPromptWithContext(agentData.prompt, contextVarName, headersVarName, contextConfigData, q, true)},`
      );
    } else {
      lines.push(`${indentation}prompt: ${formatString(agentData.prompt, q, true)},`);
    }
  }

  // models - model configuration overrides (only when different from project level)
  if (agentData.models && hasDistinctModels(agentData.models, projectModels)) {
    lines.push(`${indentation}models: {`);

    if (agentData.models.base?.model) {
      lines.push(`${indentation}${indentation}base: {`);
      lines.push(
        `${indentation}${indentation}${indentation}model: ${formatString(agentData.models.base.model, q)}`
      );
      if (agentData.models.base.providerOptions) {
        lines.push(`${indentation}${indentation}${indentation},`);
        lines.push(
          `${indentation}${indentation}${indentation}providerOptions: ${JSON.stringify(agentData.models.base.providerOptions)}`
        );
      }
      lines.push(`${indentation}${indentation}},`);
    }

    if (agentData.models.structuredOutput?.model) {
      lines.push(`${indentation}${indentation}structuredOutput: {`);
      lines.push(
        `${indentation}${indentation}${indentation}model: ${formatString(agentData.models.structuredOutput.model, q)}`
      );
      if (agentData.models.structuredOutput.providerOptions) {
        lines.push(`${indentation}${indentation}${indentation},`);
        lines.push(
          `${indentation}${indentation}${indentation}providerOptions: ${JSON.stringify(agentData.models.structuredOutput.providerOptions)}`
        );
      }
      lines.push(`${indentation}${indentation}},`);
    }

    if (agentData.models.summarizer?.model) {
      lines.push(`${indentation}${indentation}summarizer: {`);
      lines.push(
        `${indentation}${indentation}${indentation}model: ${formatString(agentData.models.summarizer.model, q)}`
      );
      if (agentData.models.summarizer.providerOptions) {
        lines.push(`${indentation}${indentation}${indentation},`);
        lines.push(
          `${indentation}${indentation}${indentation}providerOptions: ${JSON.stringify(agentData.models.summarizer.providerOptions)}`
        );
      }
      lines.push(`${indentation}${indentation}},`);
    }

    // Remove trailing comma from last model entry
    removeTrailingComma(lines);

    lines.push(`${indentation}},`);
  }

  // defaultSubAgent - reference to the default sub-agent
  if (agentData.defaultSubAgentId) {
    if (!registry) {
      throw new Error('Registry is required for defaultSubAgent generation');
    }

    const defaultSubAgentVar = registry.getVariableName(agentData.defaultSubAgentId, 'subAgents');

    if (!defaultSubAgentVar) {
      throw new Error(
        `Failed to resolve variable name for default sub-agent: ${agentData.defaultSubAgentId}`
      );
    }

    lines.push(`${indentation}defaultSubAgent: ${defaultSubAgentVar},`);
  }

  // subAgents - function returning array of sub-agent references
  if (
    agentData.subAgents &&
    typeof agentData.subAgents === 'object' &&
    Object.keys(agentData.subAgents).length > 0
  ) {
    if (!registry) {
      throw new Error('Registry is required for subAgents generation');
    }

    // subAgents is an object with IDs as keys, extract the keys
    const subAgentIds = Object.keys(agentData.subAgents);
    const subAgentsArray = registry.formatReferencesForCode(subAgentIds, 'subAgents', style, 2);

    if (!subAgentsArray) {
      throw new Error(`Failed to resolve variable names for sub-agents: ${subAgentIds.join(', ')}`);
    }

    lines.push(`${indentation}subAgents: () => ${subAgentsArray},`);
  }

  // contextConfig - reference to context configuration (generated separately)
  if (agentData.contextConfig && registry && agentData.contextConfig.id) {
    const contextConfigVar = registry.getVariableName(agentData.contextConfig.id, 'contextConfigs');
    if (contextConfigVar) {
      lines.push(`${indentation}contextConfig: ${contextConfigVar},`);
    } else {
      lines.push(`${indentation}contextConfig: undefined,`);
    }
  }

  // stopWhen - stopping conditions for the agent (only supports transferCountIs)
  if (agentData.stopWhen) {
    const stopWhenFormatted = formatStopWhen(agentData.stopWhen, style, 1);
    if (stopWhenFormatted) {
      lines.push(stopWhenFormatted);
    }
  }

  // statusUpdates - status updates configuration with statusComponents and prompt
  if (agentData.statusUpdates) {
    const statusUpdatesFormatted = formatStatusUpdates(
      agentData.statusUpdates,
      style,
      1,
      registry,
      contextConfigData,
      agentId
    );
    if (statusUpdatesFormatted) {
      lines.push(statusUpdatesFormatted);
    }
  }

  // Remove trailing comma from last line
  removeTrailingComma(lines);

  lines.push(`})${semi}`);

  return lines.join('\n');
}

/**
 * Generate imports needed for an agent file
 */
export function generateAgentImports(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry,
  contextConfigData?: any
): string[] {
  const imports: string[] = [];

  // Always import agent from SDK
  imports.push(generateImport(['agent'], '@inkeep/agents-sdk', style));

  // Generate imports for referenced components if registry is available
  if (registry) {
    const currentFilePath = `agents/${agentId}.ts`;

    // Collect all component references with their types
    const referencedComponents: Array<{ id: string; type: ComponentType }> = [];

    // Sub-agent references (subAgents is an object with IDs as keys)
    if (agentData.subAgents && typeof agentData.subAgents === 'object') {
      const subAgentIds = Object.keys(agentData.subAgents);
      referencedComponents.push(
        ...subAgentIds.map((id) => ({ id, type: 'subAgents' as ComponentType }))
      );
    }

    // Status component references
    if (
      agentData.statusUpdates &&
      agentData.statusUpdates.statusComponents &&
      Array.isArray(agentData.statusUpdates.statusComponents)
    ) {
      for (const comp of agentData.statusUpdates.statusComponents) {
        if (typeof comp === 'string') {
          referencedComponents.push({ id: comp, type: 'statusComponents' });
        } else if (typeof comp === 'object' && comp) {
          const statusId = comp.id || comp.type || comp.name;
          if (statusId) referencedComponents.push({ id: statusId, type: 'statusComponents' });
        }
      }
    }

    // Context config reference
    if (agentData.contextConfig) {
      // Use actual contextConfig.id
      const contextConfigId = agentData.contextConfig.id;
      referencedComponents.push({ id: contextConfigId, type: 'contextConfigs' });
    }

    // Default sub-agent reference
    if (agentData.defaultSubAgentId) {
      referencedComponents.push({ id: agentData.defaultSubAgentId, type: 'subAgents' });
    }

    // Get import statements for all referenced components
    const componentImports = registry.getImportsForFile(currentFilePath, referencedComponents);
    imports.push(...componentImports);
  }

  return imports;
}

/**
 * Generate complete agent file (imports + definition)
 */
export function generateAgentFile(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry,
  contextConfigData?: any,
  projectModels?: any
): string {
  const imports = generateAgentImports(agentId, agentData, style, registry, contextConfigData);
  const definition = generateAgentDefinition(
    agentId,
    agentData,
    style,
    registry,
    contextConfigData,
    projectModels
  );

  return generateFileContent(imports, [definition]);
}
