/**
 * Sub Agent Generator - Generate sub-agent definitions
 *
 * Generates sub-agents using the subAgent() builder function from @inkeep/agents-sdk
 * Sub-agents are the individual agents within an agent graph that handle specific tasks
 */

import type { ComponentRegistry } from '../utils/component-registry';
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
 * Check if subAgent models are different from parent agent models (or project models)
 */
function hasDistinctModels(subAgentModels: any, parentModels: any): boolean {
  if (!subAgentModels) return false;
  if (!parentModels) return !!subAgentModels; // SubAgent has models but parent doesn't
  
  // Compare each model type
  const modelTypes = ['base', 'structuredOutput', 'summarizer'];
  
  for (const type of modelTypes) {
    const subAgentModel = subAgentModels[type]?.model;
    const parentModel = parentModels[type]?.model;
    
    // Check if models are different (including when one exists and other doesn't)
    if (subAgentModel !== parentModel) {
      return true;
    }
    
    // Check provider options (only if both models exist)
    if (subAgentModel && parentModel) {
      const subAgentOptions = subAgentModels[type]?.providerOptions;
      const parentOptions = parentModels[type]?.providerOptions;
      
      // Deep comparison for provider options
      if (subAgentOptions !== parentOptions) {
        if (!subAgentOptions && !parentOptions) {
          // Both are falsy, they're the same
          continue;
        }
        if (!subAgentOptions || !parentOptions) {
          // One is falsy, other isn't - they're different
          return true;
        }
        // Both exist, compare as JSON
        if (JSON.stringify(subAgentOptions) !== JSON.stringify(parentOptions)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Generate Sub Agent Definition using subAgent() builder function
 */
export function generateSubAgentDefinition(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry,
  parentAgentId?: string,
  contextConfigData?: any,
  parentModels?: any
): string {
  const { quotes, semicolons, indentation } = style;
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  const agentVarName = toCamelCase(agentId);
  const lines: string[] = [];

  lines.push(`export const ${agentVarName} = subAgent({`);
  lines.push(`${indentation}id: ${formatString(agentId, q)},`);

  // Name is required
  if (agentData.name !== undefined && agentData.name !== null) {
    lines.push(`${indentation}name: ${formatString(agentData.name, q)},`);
  } else {
    // Use agent ID as fallback name
    lines.push(`${indentation}name: ${formatString(agentId, q)},`);
  }

  if (agentData.description !== undefined && agentData.description !== null) {
    lines.push(`${indentation}description: ${formatString(agentData.description, q, true)},`);
  }

  // Prompt - can be multiline, use context.toTemplate() or headers.toTemplate() based on schema analysis
  if (agentData.prompt !== undefined && agentData.prompt !== null) {
    const contextVarName = registry?.getVariableName(`${parentAgentId}Context`);
    
    if (hasTemplateVariables(agentData.prompt) && parentAgentId && registry && contextConfigData && contextVarName) {
      const headersVarName = 'headersSchema';
      lines.push(
        `${indentation}prompt: ${formatPromptWithContext(agentData.prompt, contextVarName, headersVarName, contextConfigData, q, true)},`
      );
    } else {
      lines.push(`${indentation}prompt: ${formatString(agentData.prompt, q, true)},`);
    }
  }

  // models - model configuration overrides (only when different from parent agent/project level)
  if (agentData.models && hasDistinctModels(agentData.models, parentModels)) {
    lines.push(`${indentation}models: {`);
    
    if (agentData.models.base?.model) {
      lines.push(`${indentation}${indentation}base: {`);
      lines.push(`${indentation}${indentation}${indentation}model: ${formatString(agentData.models.base.model, q)}`);
      if (agentData.models.base.providerOptions) {
        lines.push(`${indentation}${indentation}${indentation},`);
        lines.push(`${indentation}${indentation}${indentation}providerOptions: ${JSON.stringify(agentData.models.base.providerOptions)}`);
      }
      lines.push(`${indentation}${indentation}},`);
    }
    
    if (agentData.models.structuredOutput?.model) {
      lines.push(`${indentation}${indentation}structuredOutput: {`);
      lines.push(`${indentation}${indentation}${indentation}model: ${formatString(agentData.models.structuredOutput.model, q)}`);
      if (agentData.models.structuredOutput.providerOptions) {
        lines.push(`${indentation}${indentation}${indentation},`);
        lines.push(`${indentation}${indentation}${indentation}providerOptions: ${JSON.stringify(agentData.models.structuredOutput.providerOptions)}`);
      }
      lines.push(`${indentation}${indentation}},`);
    }
    
    if (agentData.models.summarizer?.model) {
      lines.push(`${indentation}${indentation}summarizer: {`);
      lines.push(`${indentation}${indentation}${indentation}model: ${formatString(agentData.models.summarizer.model, q)}`);
      if (agentData.models.summarizer.providerOptions) {
        lines.push(`${indentation}${indentation}${indentation},`);
        lines.push(`${indentation}${indentation}${indentation}providerOptions: ${JSON.stringify(agentData.models.summarizer.providerOptions)}`);
      }
      lines.push(`${indentation}${indentation}},`);
    }
    
    // Remove trailing comma from last model entry
    removeTrailingComma(lines);
    
    lines.push(`${indentation}},`);
  }

  // canUse - tools that this agent can use directly (with .with() configuration if present)
  if (agentData.canUse && Array.isArray(agentData.canUse) && agentData.canUse.length > 0) {
    
    const toolReferences: string[] = [];
    
    for (const toolRelation of agentData.canUse) {
      // Extract toolId from the relation object
      const toolId = toolRelation.toolId;
      const toolVarName = registry?.getVariableName(toolId);
      
      if (!toolVarName) {
        continue; // Skip if registry is undefined or tool not found
      }
      
      // Check if this tool has configuration (toolSelection or headers)
      const hasToolSelection = toolRelation.toolSelection && toolRelation.toolSelection.length > 0;
      const hasHeaders = toolRelation.headers && Object.keys(toolRelation.headers).length > 0;
      
      if (hasToolSelection || hasHeaders) {
        // Generate .with() configuration
        const configLines: string[] = [];
        
        // Add selectedTools (mapped from toolSelection)
        if (hasToolSelection) {
          const selectedToolsStr = JSON.stringify(toolRelation.toolSelection);
          configLines.push(`selectedTools: ${selectedToolsStr}`);
        }
        
        // Add headers if present
        if (hasHeaders) {
          const headersStr = JSON.stringify(toolRelation.headers);
          configLines.push(`headers: ${headersStr}`);
        }
        
        const configStr = configLines.join(', ');
        const finalRef = `${toolVarName}.with({ ${configStr} })`;
        toolReferences.push(finalRef);
      } else {
        // Simple reference without configuration
        toolReferences.push(toolVarName);
      }
    }
    
    // Format the array manually since we have custom .with() calls mixed with simple references
    const { indentation: indent } = style;
    const nestedIndent = indent.repeat(2);
    if (toolReferences.length === 1) {
      lines.push(`${indentation}canUse: () => [${toolReferences[0]}],`);
    } else {
      lines.push(`${indentation}canUse: () => [`);
      toolReferences.forEach((ref, index) => {
        const isLast = index === toolReferences.length - 1;
        lines.push(`${indentation}${nestedIndent}${ref}${isLast ? '' : ','}`);
      });
      lines.push(`${indentation}],`);
    }
  }

  // canDelegateTo - other agents this agent can delegate to (with .with() configuration if present)
  if (
    agentData.canDelegateTo &&
    Array.isArray(agentData.canDelegateTo) &&
    agentData.canDelegateTo.length > 0
  ) {
    const delegateReferences: string[] = [];
    
    for (const delegateRelation of agentData.canDelegateTo) {
      
      // Extract target ID from different possible structures
      let targetAgentId: string | undefined;
      let hasHeaders = false;
      
      if (typeof delegateRelation === 'string') {
        // Simple string reference
        targetAgentId = delegateRelation;
        hasHeaders = false;
      } else if (delegateRelation && typeof delegateRelation === 'object') {
        // Object with either agentId or externalAgentId
        targetAgentId = delegateRelation.agentId || delegateRelation.externalAgentId;
        hasHeaders = delegateRelation.headers && Object.keys(delegateRelation.headers).length > 0;
      }
      
      if (!targetAgentId) {
        continue; // Skip if no valid target ID found
      }
      
      const agentVarName = registry?.getVariableName(targetAgentId);
      
      if (!agentVarName) {
        continue; // Skip if registry is undefined or agent not found
      }
      
      if (hasHeaders) {
        // Generate .with() configuration for headers
        const headersStr = JSON.stringify(delegateRelation.headers);
        const finalRef = `${agentVarName}.with({ headers: ${headersStr} })`;
        delegateReferences.push(finalRef);
      } else {
        // Simple reference without configuration
        delegateReferences.push(agentVarName);
      }
    }
    
    // Format the array manually since we have custom .with() calls mixed with simple references
    const { indentation: indent } = style;
    const nestedIndent = indent.repeat(2);
    if (delegateReferences.length === 1) {
      lines.push(`${indentation}canDelegateTo: () => [${delegateReferences[0]}],`);
    } else {
      lines.push(`${indentation}canDelegateTo: () => [`);
      delegateReferences.forEach((ref, index) => {
        const isLast = index === delegateReferences.length - 1;
        lines.push(`${indentation}${nestedIndent}${ref}${isLast ? '' : ','}`);
      });
      lines.push(`${indentation}],`);
    }
  }

  // canTransferTo - agents this agent can transfer to (legacy, but still supported)
  if (
    agentData.canTransferTo &&
    Array.isArray(agentData.canTransferTo) &&
    agentData.canTransferTo.length > 0 &&
    registry
  ) {
    const transferArray = registry.formatReferencesForCode(agentData.canTransferTo, style, 2);
    lines.push(`${indentation}canTransferTo: () => ${transferArray},`);
  }

  // dataComponents - data components this agent can use
  if (
    agentData.dataComponents &&
    Array.isArray(agentData.dataComponents) &&
    agentData.dataComponents.length > 0 &&
    registry
  ) {
    const dataComponentsArray = registry.formatReferencesForCode(
      agentData.dataComponents,
      style,
      2
    );
    lines.push(`${indentation}dataComponents: () => ${dataComponentsArray},`);
  }

  // artifactComponents - artifact components this agent can use
  if (
    agentData.artifactComponents &&
    Array.isArray(agentData.artifactComponents) &&
    agentData.artifactComponents.length > 0 &&
    registry
  ) {
    const artifactComponentsArray = registry.formatReferencesForCode(
      agentData.artifactComponents,
      style,
      2
    );
    lines.push(`${indentation}artifactComponents: () => ${artifactComponentsArray},`);
  }

  // stopWhen - stopping conditions for the agent (sub-agents only support stepCountIs)
  if (agentData.stopWhen && agentData.stopWhen.stepCountIs !== undefined) {
    lines.push(`${indentation}stopWhen: {`);
    lines.push(
      `${indentation}${indentation}stepCountIs: ${agentData.stopWhen.stepCountIs} // Max tool calls + LLM responses`
    );
    lines.push(`${indentation}},`);
  }

  // Remove trailing comma from last line
  removeTrailingComma(lines);

  lines.push(`})${semi}`);

  return lines.join('\n');
}

/**
 * Generate imports needed for a sub-agent file
 */
export function generateSubAgentImports(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry,
  parentAgentId?: string,
  contextConfigData?: any
): string[] {
  const imports: string[] = [];

  // Always import subAgent from SDK
  imports.push(generateImport(['subAgent'], '@inkeep/agents-sdk', style));

  // Import context config or headers if prompt has template variables
  if (hasTemplateVariables(agentData.prompt) && parentAgentId && registry && contextConfigData) {
    const contextConfigId = `${parentAgentId}Context`;
    const currentFilePath = `agents/sub-agents/${agentId}.ts`;
    const importStatement = registry.getImportStatement(currentFilePath, contextConfigId);
    if (importStatement) {
      imports.push(importStatement);
    }
  }

  // Generate imports for referenced components if registry is available
  if (registry) {
    const currentFilePath = `agents/sub-agents/${agentId}.ts`;

    // Let the ComponentRegistry extract all component IDs from reference arrays
    const referenceArrays = [
      agentData.canUse,
      agentData.canDelegateTo,
      agentData.canTransferTo,
      agentData.dataComponents,
      agentData.artifactComponents,
    ];

    const referencedIds = registry.getReferencedComponentIds(referenceArrays);

    // Get import statements for all referenced components
    if (referencedIds.length > 0) {
      const componentImports = registry.getImportsForFile(currentFilePath, referencedIds);
      imports.push(...componentImports);
    }
  }

  return imports;
}

/**
 * Generate complete sub-agent file (imports + definition)
 */
export function generateSubAgentFile(
  agentId: string,
  agentData: any,
  style: CodeStyle = DEFAULT_STYLE,
  registry?: ComponentRegistry,
  parentAgentId?: string,
  contextConfigData?: any,
  parentModels?: any
): string {
  const imports = generateSubAgentImports(
    agentId,
    agentData,
    style,
    registry,
    parentAgentId,
    contextConfigData
  );
  const definition = generateSubAgentDefinition(
    agentId,
    agentData,
    style,
    registry,
    parentAgentId,
    contextConfigData,
    parentModels
  );

  return generateFileContent(imports, [definition]);
}
