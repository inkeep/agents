/**
 * Deterministic agent generator - creates TypeScript agent files from FullProjectDefinition
 */

import { 
  type CodeStyle, 
  DEFAULT_CODE_STYLE, 
  toVariableName, 
  formatString,
  formatObject,
  formatZodSchema,
  formatStringWithTemplates,
  ensureUniqueName,
  type ComponentType
} from './generator-utils';
import type { FullProjectDefinition } from '@inkeep/agents-core';

// Re-export for backwards compatibility with tests
export { DEFAULT_CODE_STYLE, type CodeStyle };

/**
 * Generate imports needed for an agent
 */
export function generateAgentImports(
  agentId: string,
  agentData: any,
  project: FullProjectDefinition,
  style: CodeStyle = DEFAULT_CODE_STYLE,
  componentNameMap: Map<string, { name: string; type: ComponentType }> = new Map()
): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  const imports: string[] = [];
  
  // Always import SDK
  const sdkImports = ['agent', 'subAgent'];
  
  // Check if we need contextConfig imports from agents-core
  const agentsCoreImports: string[] = [];
  if (agentData.contextConfig) {
    agentsCoreImports.push('contextConfig');
    // Check if contextConfig uses headers or fetchDefinition
    if (agentData.contextConfig.headers || hasHeadersTemplateVariables(agentData.contextConfig)) {
      agentsCoreImports.push('headers');
    }
    if (agentData.contextConfig.contextVariables) {
      agentsCoreImports.push('fetchDefinition');
    }
  }
  
  // Add SDK imports
  imports.push(`import { ${sdkImports.join(', ')} } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  // Add agents-core imports if needed
  if (agentsCoreImports.length > 0) {
    imports.push(`import { ${agentsCoreImports.join(', ')} } from ${q}@inkeep/agents-core${q}${semi}`);
  }
  
  // Add zod import if needed
  if (needsZodImport(agentData)) {
    imports.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  // Add component imports (tools, data components, etc.)
  const componentImports = generateComponentImports(agentData, componentNameMap, q, semi);
  imports.push(...componentImports);
  
  return imports;
}

/**
 * Generate export definition for an agent (without imports)
 */
export function generateAgentExport(
  agentId: string,
  agentData: any,
  project: FullProjectDefinition,
  style: CodeStyle = DEFAULT_CODE_STYLE,
  componentNameMap: Map<string, { name: string; type: ComponentType }> = new Map()
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // Generate contextConfig-related variables if present
  if (agentData.contextConfig) {
    lines.push(...generateContextConfigVariables(agentData.contextConfig, style));
    lines.push('');
  }
  
  // Generate separate variables for all subAgents using global names
  const subAgentVariables: string[] = [];
  const subAgentVarNames = new Map<string, string>();
  
  // Get subAgent variable names from global registry (they should have been registered)
  if (agentData.subAgents) {
    for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
      const globalEntry = componentNameMap.get(`subAgent:${subAgentId}`);
      const subAgentVarName = globalEntry?.name || toSubAgentVariableName(subAgentId);
      subAgentVarNames.set(subAgentId, subAgentVarName);
    }
    
    // Generate the actual subAgent code using global variable names
    for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
      const subAgentVarName = subAgentVarNames.get(subAgentId)!;
      const subAgentCode = generateSubAgentVariable(subAgentData as any, subAgentVarName, agentData, project, style, subAgentVarNames);
      subAgentVariables.push(subAgentCode);
    }
  }
  
  // Add all subAgent variables
  for (const subAgentVar of subAgentVariables) {
    lines.push(subAgentVar);
    lines.push('');
  }
  
  // Get agent variable name from global registry
  const globalEntry = componentNameMap.get(`agent:${agentId}`);
  const agentVarName = globalEntry?.name || toAgentVariableName(agentId);
  
  // Export the agent
  lines.push(`export const ${agentVarName} = agent({`);
  lines.push(`${indent}id: ${q}${agentId}${q},`);
  lines.push(`${indent}name: ${formatString(agentData.name || agentId, q)},`);
  
  if (agentData.description) {
    lines.push(`${indent}description: ${formatString(agentData.description, q)},`);
  }
  
  if (agentData.prompt) {
    lines.push(`${indent}prompt: ${formatString(agentData.prompt, q)},`);
  }
  
  // Add contextConfig if available (reference to generated variable)
  if (agentData.contextConfig) {
    const contextConfigVarName = generateContextConfigVariableName(agentData.contextConfig);
    lines.push(`${indent}contextConfig: ${contextConfigVarName},`);
  }
  
  // Add models with only the model types that differ from project-level
  if (agentData.models && project.models) {
    const modelsToInclude: any = {};
    
    for (const [modelType, modelConfig] of Object.entries(agentData.models)) {
      const projectModelConfig = (project.models as any)[modelType];
      
      // Include if the model type doesn't exist in project or is different
      if (!projectModelConfig || JSON.stringify(modelConfig) !== JSON.stringify(projectModelConfig)) {
        modelsToInclude[modelType] = modelConfig;
      }
    }
    
    if (Object.keys(modelsToInclude).length > 0) {
      lines.push(`${indent}models: ${formatObject(modelsToInclude, style, 1)},`);
    }
  } else if (agentData.models && !project.models) {
    // Include all models if project has no models defined
    lines.push(`${indent}models: ${formatObject(agentData.models, style, 1)},`);
  }
  
  // Only add stopWhen for agents if it differs from project-level inheritance
  if (agentData.stopWhen !== undefined && agentData.stopWhen !== null) {
    const agentStopWhen: any = {};
    if (agentData.stopWhen.transferCountIs !== undefined) {
      agentStopWhen.transferCountIs = agentData.stopWhen.transferCountIs;
    }
    
    // Only include if different from project-level stopWhen
    const projectTransferCount = project.stopWhen?.transferCountIs;
    const shouldInclude = Object.keys(agentStopWhen).length > 0 && 
      (projectTransferCount === undefined || agentStopWhen.transferCountIs !== projectTransferCount);
    
    if (shouldInclude) {
      lines.push(`${indent}stopWhen: ${JSON.stringify(agentStopWhen)},`);
    }
  }
  
  if (agentData.statusUpdates) {
    const statusUpdates = agentData.statusUpdates;
    lines.push(`${indent}statusUpdates: {`);
    
    if (statusUpdates.enabled !== undefined) {
      lines.push(`${indent}${style.indentation}enabled: ${statusUpdates.enabled},`);
    }
    
    if (statusUpdates.prompt) {
      lines.push(`${indent}${style.indentation}prompt: ${formatString(statusUpdates.prompt, q)},`);
    }
    
    if (statusUpdates.numEvents !== undefined) {
      lines.push(`${indent}${style.indentation}numEvents: ${statusUpdates.numEvents},`);
    }
    
    if (statusUpdates.timeInSeconds !== undefined) {
      lines.push(`${indent}${style.indentation}timeInSeconds: ${statusUpdates.timeInSeconds},`);
    }
    
    if (statusUpdates.statusComponents && statusUpdates.statusComponents.length > 0) {
      lines.push(`${indent}${style.indentation}statusComponents: [`);
      for (const statusComp of statusUpdates.statusComponents) {
        const statusCompVarName = toStatusComponentVariableName(statusComp.type || statusComp.id);
        lines.push(`${indent}${style.indentation}${style.indentation}${statusCompVarName}.config,`);
      }
      lines.push(`${indent}${style.indentation}],`);
    }
    
    lines.push(`${indent}},`);
  }
  
  // Add default sub-agent reference
  if (agentData.defaultSubAgentId && subAgentVarNames.has(agentData.defaultSubAgentId)) {
    const defaultSubAgentVarName = subAgentVarNames.get(agentData.defaultSubAgentId);
    lines.push(`${indent}defaultSubAgent: ${defaultSubAgentVarName},`);
  }
  
  // Add subAgents array with all subAgents
  if (subAgentVarNames.size > 0) {
    lines.push(`${indent}subAgents: () => [`);
    for (const subAgentVarName of subAgentVarNames.values()) {
      lines.push(`${indent}${style.indentation}${subAgentVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Check if we need zod import for the agent
 */
function needsZodImport(agentData: any): boolean {
  // Check if we need zod for schemas
  if (agentData.contextConfig?.headers?.schema || 
      agentData.contextConfig?.contextVariables ||
      hasHeadersTemplateVariables(agentData.contextConfig)) {
    return true;
  }
  
  return false;
}

/**
 * Generate component imports for an agent
 */
function generateComponentImports(
  agentData: any, 
  componentNameMap: Map<string, { name: string; type: ComponentType }>,
  q: string,
  semi: string
): string[] {
  const imports: string[] = [];
  
  // Collect all imports needed for an agent file
  const { toolImports, dataComponentImports, artifactComponentImports, statusComponentImports } = collectAllImports(agentData, {} as FullProjectDefinition, componentNameMap);
  
  // Add tool imports
  for (const toolImport of toolImports) {
    imports.push(`import { ${toolImport.varName} } from ${q}../tools/${toolImport.fileName}${q}${semi}`);
  }
  
  // Add data component imports  
  for (const dcImport of dataComponentImports) {
    imports.push(`import { ${dcImport.varName} } from ${q}../data-components/${dcImport.fileName}${q}${semi}`);
  }
  
  // Add artifact component imports
  for (const acImport of artifactComponentImports) {
    imports.push(`import { ${acImport.varName} } from ${q}../artifact-components/${acImport.fileName}${q}${semi}`);
  }
  
  // Add status component imports
  for (const scImport of statusComponentImports) {
    imports.push(`import { ${scImport.varName} } from ${q}../status-components/${scImport.fileName}${q}${semi}`);
  }
  
  return imports;
}

/**
 * Generate an agent file from agent data
 */
export function generateAgentFile(
  agentId: string,
  agentData: any,
  project: FullProjectDefinition,
  style: CodeStyle = DEFAULT_CODE_STYLE,
  componentNameMap: Map<string, { name: string; type: ComponentType }> = new Map()
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  // ALL IMPORTS AT TOP OF FILE
  
  // Always import SDK and potential context imports
  const sdkImports = ['agent', 'subAgent'];
  
  // Check if we need contextConfig imports from agents-core
  const agentsCoreImports: string[] = [];
  if (agentData.contextConfig) {
    agentsCoreImports.push('contextConfig');
    // Check if contextConfig uses headers or fetchDefinition
    if (agentData.contextConfig.headers || hasHeadersTemplateVariables(agentData.contextConfig)) {
      agentsCoreImports.push('headers');
    }
    if (agentData.contextConfig.contextVariables) {
      // Check if any contextVariable is a fetchDefinition
      for (const contextVar of Object.values(agentData.contextConfig.contextVariables)) {
        if ((contextVar as any).fetchConfig) {
          agentsCoreImports.push('fetchDefinition');
          break;
        }
      }
    }
  }
  
  // Check if we need zod for schemas
  let needsZodImport = false;
  if (agentData.contextConfig?.headers?.schema || 
      agentData.contextConfig?.contextVariables ||
      hasHeadersTemplateVariables(agentData.contextConfig)) {
    needsZodImport = true;
  }
  
  // Add agents-core imports if needed
  if (agentsCoreImports.length > 0) {
    lines.push(`import { ${agentsCoreImports.join(', ')} } from ${q}@inkeep/agents-core${q}${semi}`);
  }
  
  lines.push(`import { ${sdkImports.join(', ')} } from ${q}@inkeep/agents-sdk${q}${semi}`);
  
  if (needsZodImport) {
    lines.push(`import { z } from ${q}zod${q}${semi}`);
  }
  
  // Collect and add all component imports
  const { toolImports, dataComponentImports, artifactComponentImports, statusComponentImports } = collectAllImports(agentData, project, componentNameMap);
  
  // Add tool imports
  for (const toolImport of toolImports) {
    lines.push(`import { ${toolImport.varName} } from ${q}../tools/${toolImport.fileName}${q}${semi}`);
  }
  
  // Add data component imports  
  for (const dcImport of dataComponentImports) {
    lines.push(`import { ${dcImport.varName} } from ${q}../data-components/${dcImport.fileName}${q}${semi}`);
  }
  
  // Add artifact component imports
  for (const acImport of artifactComponentImports) {
    lines.push(`import { ${acImport.varName} } from ${q}../artifact-components/${acImport.fileName}${q}${semi}`);
  }
  
  // Add status component imports
  for (const scImport of statusComponentImports) {
    lines.push(`import { ${scImport.varName} } from ${q}../status-components/${scImport.fileName}${q}${semi}`);
  }
  
  lines.push('');
  
  // Generate contextConfig-related variables if present
  if (agentData.contextConfig) {
    lines.push(...generateContextConfigVariables(agentData.contextConfig, style));
    lines.push('');
  }
  
  // Generate separate variables for all subAgents using global names
  const subAgentVariables: string[] = [];
  const subAgentVarNames = new Map<string, string>();
  
  // Get subAgent variable names from global registry (they should have been registered)
  if (agentData.subAgents) {
    for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
      const globalEntry = componentNameMap.get(`subAgent:${subAgentId}`);
      const subAgentVarName = globalEntry?.name || toSubAgentVariableName(subAgentId);
      subAgentVarNames.set(subAgentId, subAgentVarName);
    }
    
    // Generate the actual subAgent code using global variable names
    for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
      const subAgentVarName = subAgentVarNames.get(subAgentId)!;
      const subAgentCode = generateSubAgentVariable(subAgentData as any, subAgentVarName, agentData, project, style, subAgentVarNames);
      subAgentVariables.push(subAgentCode);
    }
  }
  
  // Add all subAgent variables
  for (const subAgentVar of subAgentVariables) {
    lines.push(subAgentVar);
    lines.push('');
  }
  
  // Get agent variable name from global registry
  const globalEntry = componentNameMap.get(`agent:${agentId}`);
  const agentVarName = globalEntry?.name || toAgentVariableName(agentId);
  
  // Export the agent
  lines.push(`export const ${agentVarName} = agent({`);
  lines.push(`${indent}id: ${q}${agentId}${q},`);
  lines.push(`${indent}name: ${formatString(agentData.name || agentId, q)},`);
  
  if (agentData.description) {
    lines.push(`${indent}description: ${formatString(agentData.description, q)},`);
  }
  
  if (agentData.prompt) {
    lines.push(`${indent}prompt: ${formatString(agentData.prompt, q)},`);
  }
  
  // Add contextConfig if available (reference to generated variable)
  if (agentData.contextConfig) {
    const contextConfigVarName = generateContextConfigVariableName(agentData.contextConfig);
    lines.push(`${indent}contextConfig: ${contextConfigVarName},`);
  }
  
  // Add models with only the model types that differ from project-level
  if (agentData.models && project.models) {
    const modelsToInclude: any = {};
    
    for (const [modelType, modelConfig] of Object.entries(agentData.models)) {
      const projectModelConfig = (project.models as any)[modelType];
      
      // Include if the model type doesn't exist in project or is different
      if (!projectModelConfig || JSON.stringify(modelConfig) !== JSON.stringify(projectModelConfig)) {
        modelsToInclude[modelType] = modelConfig;
      }
    }
    
    if (Object.keys(modelsToInclude).length > 0) {
      lines.push(`${indent}models: ${formatObject(modelsToInclude, style, 1)},`);
    }
  } else if (agentData.models && !project.models) {
    // Include all models if project has no models defined
    lines.push(`${indent}models: ${formatObject(agentData.models, style, 1)},`);
  }
  
  // Only add stopWhen for agents if it differs from project-level inheritance
  if (agentData.stopWhen !== undefined && agentData.stopWhen !== null) {
    const agentStopWhen: any = {};
    if (agentData.stopWhen.transferCountIs !== undefined) {
      agentStopWhen.transferCountIs = agentData.stopWhen.transferCountIs;
    }
    
    // Only include if different from project-level stopWhen
    const projectTransferCount = project.stopWhen?.transferCountIs;
    const shouldInclude = Object.keys(agentStopWhen).length > 0 && 
      (projectTransferCount === undefined || agentStopWhen.transferCountIs !== projectTransferCount);
    
    if (shouldInclude) {
      lines.push(`${indent}stopWhen: ${JSON.stringify(agentStopWhen)},`);
    }
  }
  
  if (agentData.statusUpdates) {
    const statusUpdates = agentData.statusUpdates;
    lines.push(`${indent}statusUpdates: {`);
    
    if (statusUpdates.enabled !== undefined) {
      lines.push(`${indent}${style.indentation}enabled: ${statusUpdates.enabled},`);
    }
    
    if (statusUpdates.prompt) {
      lines.push(`${indent}${style.indentation}prompt: ${formatString(statusUpdates.prompt, q)},`);
    }
    
    if (statusUpdates.numEvents !== undefined) {
      lines.push(`${indent}${style.indentation}numEvents: ${statusUpdates.numEvents},`);
    }
    
    if (statusUpdates.timeInSeconds !== undefined) {
      lines.push(`${indent}${style.indentation}timeInSeconds: ${statusUpdates.timeInSeconds},`);
    }
    
    if (statusUpdates.statusComponents && statusUpdates.statusComponents.length > 0) {
      lines.push(`${indent}${style.indentation}statusComponents: [`);
      for (const statusComp of statusUpdates.statusComponents) {
        const statusCompVarName = toStatusComponentVariableName(statusComp.type || statusComp.id);
        lines.push(`${indent}${style.indentation}${style.indentation}${statusCompVarName}.config,`);
      }
      lines.push(`${indent}${style.indentation}],`);
    }
    
    lines.push(`${indent}},`);
  }
  
  // Add default sub-agent reference
  if (agentData.defaultSubAgentId && subAgentVarNames.has(agentData.defaultSubAgentId)) {
    const defaultSubAgentVarName = subAgentVarNames.get(agentData.defaultSubAgentId);
    lines.push(`${indent}defaultSubAgent: ${defaultSubAgentVarName},`);
  }
  
  // Add subAgents array with all subAgents
  if (subAgentVarNames.size > 0) {
    lines.push(`${indent}subAgents: () => [`);
    for (const subAgentVarName of subAgentVarNames.values()) {
      lines.push(`${indent}${style.indentation}${subAgentVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Generate a sub-agent variable definition
 */
function generateSubAgentVariable(
  subAgentData: any,
  varName: string,
  parentAgentData: any,
  project: FullProjectDefinition,
  style: CodeStyle,
  subAgentVarNames: Map<string, string>
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  
  const lines: string[] = [];
  
  lines.push(`const ${varName} = subAgent({`);
  lines.push(`${indent}id: ${q}${subAgentData.id}${q},`);
  lines.push(`${indent}name: ${formatString(subAgentData.name || subAgentData.id, q)},`);
  
  if (subAgentData.description) {
    lines.push(`${indent}description: ${formatString(subAgentData.description, q)},`);
  }
  
  if (subAgentData.prompt) {
    lines.push(`${indent}prompt: ${formatString(subAgentData.prompt, q)},`);
  }
  
  // Add contextConfig if available
  if (subAgentData.contextConfig) {
    lines.push(`${indent}contextConfig: ${formatObject(subAgentData.contextConfig, style, 1)},`);
  }
  
  // Add models with only the model types that differ from parent agent or project inheritance
  if (subAgentData.models) {
    const modelsToInclude: any = {};
    
    for (const [modelType, modelConfig] of Object.entries(subAgentData.models)) {
      // Check parent agent first, then project as fallback
      const parentAgentModelConfig = parentAgentData.models?.[modelType];
      const projectModelConfig = project.models?.[modelType];
      
      let inheritedConfig = null;
      if (parentAgentModelConfig) {
        // Inherit from parent agent if it has this model type
        inheritedConfig = parentAgentModelConfig;
      } else if (projectModelConfig) {
        // Fall back to project model if parent agent doesn't have it
        inheritedConfig = projectModelConfig;
      }
      
      // Include if different from inherited config or no inheritance available
      if (!inheritedConfig || JSON.stringify(modelConfig) !== JSON.stringify(inheritedConfig)) {
        modelsToInclude[modelType] = modelConfig;
      }
    }
    
    if (Object.keys(modelsToInclude).length > 0) {
      lines.push(`${indent}models: ${formatObject(modelsToInclude, style, 1)},`);
    }
  }
  
  // Only add stopWhen for subAgents if stepCountIs differs from project-level inheritance
  if (subAgentData.stopWhen !== undefined && subAgentData.stopWhen !== null) {
    const subAgentStopWhen: any = {};
    if (subAgentData.stopWhen.stepCountIs !== undefined) {
      subAgentStopWhen.stepCountIs = subAgentData.stopWhen.stepCountIs;
    }
    
    // Only include if different from project-level stepCountIs
    const projectStepCount = project.stopWhen?.stepCountIs;
    const shouldInclude = Object.keys(subAgentStopWhen).length > 0 && 
      (projectStepCount === undefined || subAgentStopWhen.stepCountIs !== projectStepCount);
    
    if (shouldInclude) {
      lines.push(`${indent}stopWhen: ${JSON.stringify(subAgentStopWhen)},`);
    }
  }
  
  // Handle tools (canUse)
  if (subAgentData.canUse && subAgentData.canUse.length > 0) {
    lines.push(`${indent}canUse: () => [`);
    for (const toolRef of subAgentData.canUse) {
      const toolId = typeof toolRef === 'string' ? toolRef : toolRef.toolId;
      const toolVarName = toToolVariableName(toolId);
      lines.push(`${indent}${style.indentation}${toolVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  // Handle data components
  if (subAgentData.dataComponents && subAgentData.dataComponents.length > 0) {
    lines.push(`${indent}dataComponents: () => [`);
    for (const dcId of subAgentData.dataComponents) {
      const dcVarName = toDataComponentVariableName(dcId);
      lines.push(`${indent}${style.indentation}${dcVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  // Handle artifact components
  if (subAgentData.artifactComponents && subAgentData.artifactComponents.length > 0) {
    lines.push(`${indent}artifactComponents: () => [`);
    for (const acId of subAgentData.artifactComponents) {
      const acVarName = toArtifactComponentVariableName(acId);
      lines.push(`${indent}${style.indentation}${acVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  // Handle delegation (canDelegateTo) - reference other subAgent variables
  if (subAgentData.canDelegateTo && subAgentData.canDelegateTo.length > 0) {
    lines.push(`${indent}canDelegateTo: () => [`);
    for (const delegateId of subAgentData.canDelegateTo) {
      const delegateVarName = subAgentVarNames.get(delegateId) || toSubAgentVariableName(delegateId);
      lines.push(`${indent}${style.indentation}${delegateVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  lines.push(`})${semi}`);
  
  return lines.join('\n');
}

/**
 * Generate a sub-agent (can be nested)
 */
function generateSubAgent(
  subAgentData: any,
  parentAgentData: any,
  project: FullProjectDefinition,
  style: CodeStyle,
  indentLevel: number
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const baseIndent = style.indentation.repeat(indentLevel);
  const indent = style.indentation.repeat(indentLevel + 1);
  
  const lines: string[] = [];
  
  lines.push(`subAgent({`);
  lines.push(`${indent}id: ${q}${subAgentData.id}${q},`);
  lines.push(`${indent}name: ${formatString(subAgentData.name || subAgentData.id, q)},`);
  
  if (subAgentData.description) {
    lines.push(`${indent}description: ${formatString(subAgentData.description, q)},`);
  }
  
  if (subAgentData.prompt) {
    lines.push(`${indent}prompt: ${formatString(subAgentData.prompt, q)},`);
  }
  
  // Add contextConfig if available
  if (subAgentData.contextConfig) {
    lines.push(`${indent}contextConfig: ${formatObject(subAgentData.contextConfig, style, 1)},`);
  }
  
  // Add models with only the model types that differ from parent agent or project inheritance
  if (subAgentData.models) {
    const modelsToInclude: any = {};
    
    for (const [modelType, modelConfig] of Object.entries(subAgentData.models)) {
      // Check parent agent first, then project as fallback
      const parentAgentModelConfig = parentAgentData.models?.[modelType];
      const projectModelConfig = project.models?.[modelType];
      
      let inheritedConfig = null;
      if (parentAgentModelConfig) {
        // Inherit from parent agent if it has this model type
        inheritedConfig = parentAgentModelConfig;
      } else if (projectModelConfig) {
        // Fall back to project model if parent agent doesn't have it
        inheritedConfig = projectModelConfig;
      }
      
      // Include if different from inherited config or no inheritance available
      if (!inheritedConfig || JSON.stringify(modelConfig) !== JSON.stringify(inheritedConfig)) {
        modelsToInclude[modelType] = modelConfig;
      }
    }
    
    if (Object.keys(modelsToInclude).length > 0) {
      lines.push(`${indent}models: ${formatObject(modelsToInclude, style, 1)},`);
    }
  }
  
  // Only add stopWhen for subAgents if stepCountIs differs from project-level inheritance
  if (subAgentData.stopWhen !== undefined && subAgentData.stopWhen !== null) {
    const subAgentStopWhen: any = {};
    if (subAgentData.stopWhen.stepCountIs !== undefined) {
      subAgentStopWhen.stepCountIs = subAgentData.stopWhen.stepCountIs;
    }
    
    // Only include if different from project-level stepCountIs
    const projectStepCount = project.stopWhen?.stepCountIs;
    const shouldInclude = Object.keys(subAgentStopWhen).length > 0 && 
      (projectStepCount === undefined || subAgentStopWhen.stepCountIs !== projectStepCount);
    
    if (shouldInclude) {
      lines.push(`${indent}stopWhen: ${JSON.stringify(subAgentStopWhen)},`);
    }
  }
  
  // Handle tools (canUse)
  if (subAgentData.canUse && subAgentData.canUse.length > 0) {
    lines.push(`${indent}canUse: () => [`);
    for (const toolRef of subAgentData.canUse) {
      const toolId = typeof toolRef === 'string' ? toolRef : toolRef.toolId;
      const toolVarName = toToolVariableName(toolId);
      lines.push(`${indent}${style.indentation}${toolVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  // Handle data components
  if (subAgentData.dataComponents && subAgentData.dataComponents.length > 0) {
    lines.push(`${indent}dataComponents: () => [`);
    for (const dcId of subAgentData.dataComponents) {
      const dcVarName = toDataComponentVariableName(dcId);
      lines.push(`${indent}${style.indentation}${dcVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  // Handle artifact components
  if (subAgentData.artifactComponents && subAgentData.artifactComponents.length > 0) {
    lines.push(`${indent}artifactComponents: () => [`);
    for (const acId of subAgentData.artifactComponents) {
      const acVarName = toArtifactComponentVariableName(acId);
      lines.push(`${indent}${style.indentation}${acVarName},`);
    }
    lines.push(`${indent}],`);
  }
  
  // Handle delegation (canDelegateTo)
  if (subAgentData.canDelegateTo && subAgentData.canDelegateTo.length > 0) {
    lines.push(`${indent}canDelegateTo: () => [`);
    for (const delegateId of subAgentData.canDelegateTo) {
      // Find the delegate sub-agent
      const delegateData = findSubAgentById(delegateId, parentAgentData, project);
      if (delegateData) {
        const nestedSubAgent = generateSubAgent(delegateData, parentAgentData, project, style, indentLevel + 2);
        lines.push(`${indent}${style.indentation}${nestedSubAgent},`);
      }
    }
    lines.push(`${indent}]`);
  }
  
  lines.push(`${baseIndent}})`);
  
  return lines.join('\n');
}

/**
 * Collect all imports needed for an agent file
 */
function collectAllImports(agentData: any, project: FullProjectDefinition, componentNameMap: Map<string, { name: string; type: ComponentType }>) {
  const toolIds = new Set<string>();
  const dataComponentIds = new Set<string>();
  const artifactComponentIds = new Set<string>();
  const statusComponentIds = new Set<string>();
  
  // Collect status components from agent-level statusUpdates
  if (agentData.statusUpdates?.statusComponents) {
    for (const statusComp of agentData.statusUpdates.statusComponents) {
      const statusCompId = statusComp.type || statusComp.id;
      if (statusCompId) {
        statusComponentIds.add(statusCompId);
      }
    }
  }
  
  // Recursively collect from all sub-agents
  function collectFromSubAgent(subAgent: any) {
    if (subAgent.canUse) {
      for (const toolRef of subAgent.canUse) {
        const toolId = typeof toolRef === 'string' ? toolRef : toolRef.toolId;
        toolIds.add(toolId);
      }
    }
    
    if (subAgent.dataComponents) {
      for (const dcId of subAgent.dataComponents) {
        dataComponentIds.add(dcId);
      }
    }
    
    if (subAgent.artifactComponents) {
      for (const acId of subAgent.artifactComponents) {
        artifactComponentIds.add(acId);
      }
    }
    
    // Recursively handle delegated sub-agents
    if (subAgent.canDelegateTo) {
      for (const delegateId of subAgent.canDelegateTo) {
        const delegateData = findSubAgentById(delegateId, agentData, project);
        if (delegateData) {
          collectFromSubAgent(delegateData);
        }
      }
    }
  }
  
  // Collect from all sub-agents in this agent
  if (agentData.subAgents) {
    for (const subAgent of Object.values(agentData.subAgents)) {
      collectFromSubAgent(subAgent);
    }
  }
  
  return {
    toolImports: Array.from(toolIds).map(toolId => {
      const globalEntry = componentNameMap.get(`tool:${toolId}`);
      return {
        id: toolId,
        varName: globalEntry?.name || toToolVariableName(toolId),
        fileName: toFileName(toolId)
      };
    }),
    dataComponentImports: Array.from(dataComponentIds).map(dcId => {
      const globalEntry = componentNameMap.get(`dataComponent:${dcId}`);
      return {
        id: dcId,
        varName: globalEntry?.name || toDataComponentVariableName(dcId),
        fileName: toFileName(dcId)
      };
    }),
    artifactComponentImports: Array.from(artifactComponentIds).map(acId => {
      const globalEntry = componentNameMap.get(`artifactComponent:${acId}`);
      return {
        id: acId,
        varName: globalEntry?.name || toArtifactComponentVariableName(acId),
        fileName: toFileName(acId)
      };
    }),
    statusComponentImports: Array.from(statusComponentIds).map(scId => {
      const globalEntry = componentNameMap.get(`statusComponent:${scId}`);
      return {
        id: scId,
        varName: globalEntry?.name || toStatusComponentVariableName(scId),
        fileName: toFileName(scId)
      };
    })
  };
}

/**
 * Find a sub-agent by ID across the agent and project
 */
function findSubAgentById(subAgentId: string, agentData: any, project: FullProjectDefinition): any {
  // First check in the current agent
  if (agentData.subAgents?.[subAgentId]) {
    return agentData.subAgents[subAgentId];
  }
  
  // Then check in other agents in the project
  for (const agent of Object.values(project.agents || {})) {
    if ((agent as any).subAgents?.[subAgentId]) {
      return (agent as any).subAgents[subAgentId];
    }
  }
  
  return null;
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
 * Convert subAgent ID to camelCase variable name
 */
function toSubAgentVariableName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

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
 * Convert data component ID to camelCase variable name
 */
function toDataComponentVariableName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Convert artifact component ID to camelCase variable name
 */
function toArtifactComponentVariableName(id: string): string {
  return id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Convert status component ID to camelCase variable name
 */
function toStatusComponentVariableName(id: string): string {
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

/**
 * Generate contextConfig-related variables
 */
function generateContextConfigVariables(contextConfig: any, style: CodeStyle): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  const lines: string[] = [];
  
  // Check if we need to generate a headers variable (either explicit or because of {{headers.}} usage)
  const needsHeaders = contextConfig.headers || hasHeadersTemplateVariables(contextConfig);
  
  if (needsHeaders) {
    const headersVarName = generateHeadersVariableName(contextConfig);
    lines.push(`const ${headersVarName} = headers({`);
    if (contextConfig.headers?.schema) {
      let zodSchemaString: string;
      if (typeof contextConfig.headers.schema === 'string') {
        // Schema is already a Zod string (converted by placeholder system)
        zodSchemaString = contextConfig.headers.schema;
      } else {
        // Schema is a JSON schema object, convert it
        zodSchemaString = formatZodSchema(contextConfig.headers.schema, style, 1);
      }
      lines.push(`${indent}schema: ${zodSchemaString},`);
    } else {
      // Generate a default schema for headers template variables
      lines.push(`${indent}schema: z.object({`);
      const headerVars = extractHeadersTemplateVariables(contextConfig);
      for (const headerVar of headerVars) {
        lines.push(`${indent}${indent}${headerVar}: z.string().optional(),`);
      }
      lines.push(`${indent}}).loose(),`);
    }
    lines.push(`})${semi}`);
    lines.push('');
  }
  
  // Generate fetchDefinition variables for each contextVariable
  if (contextConfig.contextVariables) {
    for (const [varName, contextVar] of Object.entries(contextConfig.contextVariables)) {
      if ((contextVar as any).fetchConfig) {
        lines.push(...generateFetchDefinitionVariable(varName, contextVar as any, style));
        lines.push('');
      }
    }
  }
  
  // Generate the main contextConfig variable
  const contextConfigVarName = generateContextConfigVariableName(contextConfig);
  lines.push(`const ${contextConfigVarName} = contextConfig({`);
  
  // Include the existing ID to make it deterministic
  if (contextConfig.id) {
    lines.push(`${indent}id: '${contextConfig.id}',`);
  }
  
  if (needsHeaders) {
    const headersVarName = generateHeadersVariableName(contextConfig);
    lines.push(`${indent}headers: ${headersVarName},`);
  }
  
  if (contextConfig.contextVariables) {
    lines.push(`${indent}contextVariables: {`);
    for (const [varName, contextVar] of Object.entries(contextConfig.contextVariables)) {
      if ((contextVar as any).fetchConfig) {
        const fetchVarName = generateFetchDefinitionVariableName(varName);
        lines.push(`${indent}${indent}${varName}: ${fetchVarName},`);
      }
    }
    lines.push(`${indent}},`);
  }
  
  lines.push(`})${semi}`);
  
  return lines;
}

/**
 * Generate a fetchDefinition variable
 */
function generateFetchDefinitionVariable(varName: string, contextVar: any, style: CodeStyle): string[] {
  const q = style.quotes === 'single' ? "'" : '"';
  const indent = style.indentation;
  const semi = style.semicolons ? ';' : '';
  const lines: string[] = [];
  
  const fetchVarName = generateFetchDefinitionVariableName(varName);
  
  // Add schema export if responseSchema is present
  if (contextVar.responseSchema) {
    const schemaVarName = `${varName}Schema`;
    let zodSchemaString: string;
    if (typeof contextVar.responseSchema === 'string') {
      // Schema is already a Zod string (converted by placeholder system)
      zodSchemaString = contextVar.responseSchema;
    } else {
      // Schema is a JSON schema object, convert it
      zodSchemaString = formatZodSchema(contextVar.responseSchema, style, 0);
    }
    lines.push(`export const ${schemaVarName} = ${zodSchemaString}${semi}`);
    lines.push('');
  }
  
  lines.push(`export const ${fetchVarName} = fetchDefinition({`);
  lines.push(`${indent}id: ${formatString(contextVar.id || varName, q)},`);
  lines.push(`${indent}name: ${formatString(contextVar.name || varName, q)},`);
  lines.push(`${indent}trigger: ${formatString(contextVar.trigger || 'initialization', q)},`);
  // Pass the headers variable name context for template conversion
  const headersVarName = generateHeadersVariableName({ contextVariables: { [varName]: contextVar } });
  lines.push(`${indent}fetchConfig: ${formatObjectWithHeadersContext(contextVar.fetchConfig, style, 1, headersVarName)},`);
  
  if (contextVar.responseSchema) {
    const schemaVarName = `${varName}Schema`;
    lines.push(`${indent}responseSchema: ${schemaVarName},`);
  }
  
  if (contextVar.defaultValue !== undefined) {
    lines.push(`${indent}defaultValue: ${formatString(contextVar.defaultValue, q)},`);
  }
  
  lines.push(`})${semi}`);
  
  return lines;
}

/**
 * Generate contextConfig variable name
 */
function generateContextConfigVariableName(contextConfig: any): string {
  // Generate a descriptive name based on contextVariables or fallback to generic name
  if (contextConfig.contextVariables) {
    const contextVarNames = Object.keys(contextConfig.contextVariables);
    if (contextVarNames.length > 0) {
      // Use the first context variable name as basis
      const firstName = contextVarNames[0];
      return toVariableName(firstName + 'Context');
    }
  }
  
  // Fallback to a generic name that doesn't conflict with the function
  return 'agentContext';
}

/**
 * Generate headers variable name
 */
function generateHeadersVariableName(contextConfig: any): string {
  // Generate a descriptive name based on context purpose
  if (contextConfig.contextVariables) {
    const contextVarNames = Object.keys(contextConfig.contextVariables);
    if (contextVarNames.length > 0) {
      const firstName = contextVarNames[0];
      return toVariableName(firstName + 'Headers');
    }
  }
  
  return 'requestContext';
}

/**
 * Generate fetchDefinition variable name
 */
function generateFetchDefinitionVariableName(varName: string): string {
  return `${toVariableName(varName)}FetchDefinition`;
}

/**
 * Check if contextConfig contains any {{headers.variable}} template variables
 */
function hasHeadersTemplateVariables(contextConfig: any): boolean {
  const jsonString = JSON.stringify(contextConfig);
  return /\{\{headers\.\w+\}\}/.test(jsonString);
}

/**
 * Extract all unique header variable names from {{headers.variable}} patterns
 */
function extractHeadersTemplateVariables(contextConfig: any): string[] {
  const jsonString = JSON.stringify(contextConfig);
  const pattern = /\{\{headers\.(\w+)\}\}/g;
  const matches = [...jsonString.matchAll(pattern)];
  const uniqueVars = new Set(matches.map(match => match[1]));
  return Array.from(uniqueVars);
}

/**
 * Format object with headers context for template variable conversion
 */
function formatObjectWithHeadersContext(obj: any, style: CodeStyle, indentLevel: number, headersVarName: string): string {
  const baseIndent = style.indentation.repeat(indentLevel);
  const indent = style.indentation.repeat(indentLevel + 1);
  const q = style.quotes === 'single' ? "'" : '"';
  
  if (typeof obj !== 'object' || obj === null) {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    const lines: string[] = ['['];
    for (const item of obj) {
      if (typeof item === 'object') {
        lines.push(`${indent}${formatObjectWithHeadersContext(item, style, indentLevel + 1, headersVarName)},`);
      } else {
        lines.push(`${indent}${JSON.stringify(item)},`);
      }
    }
    lines.push(`${baseIndent}]`);
    return lines.join('\n');
  }
  
  const lines: string[] = ['{'];
  for (const [key, value] of Object.entries(obj)) {
    // Quote keys that contain special characters or are not valid identifiers
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `${q}${key}${q}`;
    
    if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}${formattedKey}: ${formatObjectWithHeadersContext(value, style, indentLevel + 1, headersVarName)},`);
    } else if (typeof value === 'string') {
      // Use the passed headers variable name for template conversion
      const templateString = formatStringWithTemplates(value, q, headersVarName);
      lines.push(`${indent}${formattedKey}: ${templateString},`);
    } else {
      lines.push(`${indent}${formattedKey}: ${JSON.stringify(value)},`);
    }
  }
  lines.push(`${baseIndent}}`);
  
  return lines.join('\n');
}