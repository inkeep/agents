/**
 * Component dependency resolver - determines what imports new components actually need
 * 
 * This system analyzes component definitions from the API to determine what other components
 * they reference, then finds where those components exist locally for import statements.
 * 
 * Key principle: Only components that exist in the API data can be imported/referenced.
 * Local files that don't exist in the API should be ignored.
 */

import chalk from 'chalk';
import type { FullProjectDefinition, SubAgentDefinition } from '@inkeep/agents-core';

export interface ComponentDependency {
  componentId: string;
  componentType: 'agent' | 'tool' | 'function' | 'dataComponent' | 'artifactComponent' | 'externalAgent' | 'statusComponent';
  referencedBy: string; // which component needs this import
  reason: string; // why it's needed (e.g., "canUse", "credentialReferenceId", "subAgent")
}

export interface ResolvedDependencies {
  // Map of component ID -> what it needs to import
  dependencies: Map<string, ComponentDependency[]>;
  // All unique components that need to be importable
  allReferencedComponents: Set<string>;
}

/**
 * Analyze project data to determine what components reference what other components
 * Only considers components that exist in the API data
 */
export function resolveComponentDependencies(
  projectData: FullProjectDefinition,
  newComponentIds: Set<string>
): ResolvedDependencies {
  console.log(chalk.gray(`🔗 Resolving component dependencies from API data...`));
  
  const dependencies = new Map<string, ComponentDependency[]>();
  const allReferencedComponents = new Set<string>();

  // Get all components that exist in the API (these are the only ones that can be imported)
  const availableComponents = getAvailableComponentsFromAPI(projectData);
  console.log(chalk.gray(`  📋 Available components from API: ${Array.from(availableComponents.keys()).join(', ')}`));

  // Analyze each component type for dependencies
  if (projectData.agents) {
    for (const [agentId, agentData] of Object.entries(projectData.agents)) {
      if (!newComponentIds.has(agentId)) continue; // Only analyze new components
      
      const agentDeps = analyzeAgentDependencies(agentId, agentData, availableComponents);
      if (agentDeps.length > 0) {
        dependencies.set(agentId, agentDeps);
        agentDeps.forEach(dep => allReferencedComponents.add(dep.componentId));
      }
    }
  }

  if (projectData.tools) {
    for (const [toolId, toolData] of Object.entries(projectData.tools)) {
      if (!newComponentIds.has(toolId)) continue; // Only analyze new components
      
      const toolDeps = analyzeToolDependencies(toolId, toolData, availableComponents);
      if (toolDeps.length > 0) {
        dependencies.set(toolId, toolDeps);
        toolDeps.forEach(dep => allReferencedComponents.add(dep.componentId));
      }
    }
  }

  if (projectData.functions) {
    for (const [functionId, functionData] of Object.entries(projectData.functions)) {
      if (!newComponentIds.has(functionId)) continue; // Only analyze new components
      
      const functionDeps = analyzeFunctionDependencies(functionId, functionData, availableComponents);
      if (functionDeps.length > 0) {
        dependencies.set(functionId, functionDeps);
        functionDeps.forEach(dep => allReferencedComponents.add(dep.componentId));
      }
    }
  }

  if (projectData.dataComponents) {
    for (const [componentId, componentData] of Object.entries(projectData.dataComponents)) {
      if (!newComponentIds.has(componentId)) continue; // Only analyze new components
      
      const dataDeps = analyzeDataComponentDependencies(componentId, componentData, availableComponents);
      if (dataDeps.length > 0) {
        dependencies.set(componentId, dataDeps);
        dataDeps.forEach(dep => allReferencedComponents.add(dep.componentId));
      }
    }
  }

  if (projectData.artifactComponents) {
    for (const [componentId, componentData] of Object.entries(projectData.artifactComponents)) {
      if (!newComponentIds.has(componentId)) continue; // Only analyze new components
      
      const artifactDeps = analyzeArtifactComponentDependencies(componentId, componentData, availableComponents);
      if (artifactDeps.length > 0) {
        dependencies.set(componentId, artifactDeps);
        artifactDeps.forEach(dep => allReferencedComponents.add(dep.componentId));
      }
    }
  }

  if (projectData.externalAgents) {
    for (const [agentId, agentData] of Object.entries(projectData.externalAgents)) {
      if (!newComponentIds.has(agentId)) continue; // Only analyze new components
      
      const externalDeps = analyzeExternalAgentDependencies(agentId, agentData, availableComponents);
      if (externalDeps.length > 0) {
        dependencies.set(agentId, externalDeps);
        externalDeps.forEach(dep => allReferencedComponents.add(dep.componentId));
      }
    }
  }

  console.log(chalk.gray(`  ✅ Found dependencies for ${dependencies.size} new components`));
  console.log(chalk.gray(`  📦 Total unique components referenced: ${allReferencedComponents.size}`));

  return {
    dependencies,
    allReferencedComponents
  };
}

/**
 * Get all components that exist in the API data (these are the only ones that can be imported)
 */
function getAvailableComponentsFromAPI(projectData: FullProjectDefinition): Map<string, { type: string }> {
  const available = new Map<string, { type: string }>();

  if (projectData.agents) {
    for (const agentId of Object.keys(projectData.agents)) {
      available.set(agentId, { type: 'agent' });
    }
  }

  if (projectData.tools) {
    for (const toolId of Object.keys(projectData.tools)) {
      available.set(toolId, { type: 'tool' });
    }
  }

  if (projectData.functions) {
    for (const functionId of Object.keys(projectData.functions)) {
      available.set(functionId, { type: 'function' });
    }
  }

  if (projectData.functionTools) {
    for (const functionToolId of Object.keys(projectData.functionTools)) {
      available.set(functionToolId, { type: 'functionTool' });
    }
  }

  if (projectData.dataComponents) {
    for (const componentId of Object.keys(projectData.dataComponents)) {
      available.set(componentId, { type: 'dataComponent' });
    }
  }

  if (projectData.artifactComponents) {
    for (const componentId of Object.keys(projectData.artifactComponents)) {
      available.set(componentId, { type: 'artifactComponent' });
    }
  }

  if (projectData.externalAgents) {
    for (const agentId of Object.keys(projectData.externalAgents)) {
      available.set(agentId, { type: 'externalAgent' });
    }
  }

  return available;
}

/**
 * Analyze what an agent depends on based on its configuration
 */
function analyzeAgentDependencies(
  agentId: string,
  agentData: SubAgentDefinition,
  availableComponents: Map<string, { type: string }>
): ComponentDependency[] {
  const deps: ComponentDependency[] = [];

  // Check canUse array - these reference tools, data components, etc.
  if (agentData.canUse) {
    for (const canUseItem of agentData.canUse) {
      if (typeof canUseItem === 'string') {
        // Simple string reference
        if (availableComponents.has(canUseItem)) {
          const componentInfo = availableComponents.get(canUseItem)!;
          deps.push({
            componentId: canUseItem,
            componentType: componentInfo.type as any,
            referencedBy: agentId,
            reason: 'canUse'
          });
        }
      } else if (canUseItem && typeof canUseItem === 'object') {
        // Object with toolId, dataComponentId, etc.
        if ('toolId' in canUseItem && canUseItem.toolId && availableComponents.has(canUseItem.toolId)) {
          const componentInfo = availableComponents.get(canUseItem.toolId)!;
          deps.push({
            componentId: canUseItem.toolId,
            componentType: componentInfo.type as any,
            referencedBy: agentId,
            reason: 'canUse.toolId'
          });
        }
        if ('dataComponentId' in canUseItem && canUseItem.dataComponentId && availableComponents.has(canUseItem.dataComponentId)) {
          const componentInfo = availableComponents.get(canUseItem.dataComponentId)!;
          deps.push({
            componentId: canUseItem.dataComponentId,
            componentType: componentInfo.type as any,
            referencedBy: agentId,
            reason: 'canUse.dataComponentId'
          });
        }
        if ('artifactComponentId' in canUseItem && canUseItem.artifactComponentId && availableComponents.has(canUseItem.artifactComponentId)) {
          const componentInfo = availableComponents.get(canUseItem.artifactComponentId)!;
          deps.push({
            componentId: canUseItem.artifactComponentId,
            componentType: componentInfo.type as any,
            referencedBy: agentId,
            reason: 'canUse.artifactComponentId'
          });
        }
      }
    }
  }

  // Check dataComponents array
  if (agentData.dataComponents) {
    for (const dataComponentId of agentData.dataComponents) {
      if (availableComponents.has(dataComponentId)) {
        const componentInfo = availableComponents.get(dataComponentId)!;
        deps.push({
          componentId: dataComponentId,
          componentType: componentInfo.type as any,
          referencedBy: agentId,
          reason: 'dataComponents'
        });
      }
    }
  }

  // Check artifactComponents array
  if (agentData.artifactComponents) {
    for (const artifactComponentId of agentData.artifactComponents) {
      if (availableComponents.has(artifactComponentId)) {
        const componentInfo = availableComponents.get(artifactComponentId)!;
        deps.push({
          componentId: artifactComponentId,
          componentType: componentInfo.type as any,
          referencedBy: agentId,
          reason: 'artifactComponents'
        });
      }
    }
  }

  // Check canTransferTo array (references other agents)
  if (agentData.canTransferTo) {
    for (const transferToId of agentData.canTransferTo) {
      if (availableComponents.has(transferToId)) {
        const componentInfo = availableComponents.get(transferToId)!;
        deps.push({
          componentId: transferToId,
          componentType: componentInfo.type as any,
          referencedBy: agentId,
          reason: 'canTransferTo'
        });
      }
    }
  }

  // Check canDelegateTo array (references other agents or external agents)
  if (agentData.canDelegateTo) {
    for (const delegateToItem of agentData.canDelegateTo) {
      if (typeof delegateToItem === 'string') {
        // Internal agent reference
        if (availableComponents.has(delegateToItem)) {
          const componentInfo = availableComponents.get(delegateToItem)!;
          deps.push({
            componentId: delegateToItem,
            componentType: componentInfo.type as any,
            referencedBy: agentId,
            reason: 'canDelegateTo'
          });
        }
      } else if (delegateToItem && typeof delegateToItem === 'object' && 'externalAgentId' in delegateToItem) {
        // External agent reference
        if (delegateToItem.externalAgentId && availableComponents.has(delegateToItem.externalAgentId)) {
          const componentInfo = availableComponents.get(delegateToItem.externalAgentId)!;
          deps.push({
            componentId: delegateToItem.externalAgentId,
            componentType: componentInfo.type as any,
            referencedBy: agentId,
            reason: 'canDelegateTo.externalAgentId'
          });
        }
      }
    }
  }

  // Check statusComponent reference (agent-level attribute)
  if (agentData.statusComponent && availableComponents.has(agentData.statusComponent)) {
    const componentInfo = availableComponents.get(agentData.statusComponent)!;
    deps.push({
      componentId: agentData.statusComponent,
      componentType: componentInfo.type as any,
      referencedBy: agentId,
      reason: 'statusComponent'
    });
  }

  return deps;
}

/**
 * Analyze what a tool depends on based on its configuration
 */
function analyzeToolDependencies(
  toolId: string,
  toolData: any,
  availableComponents: Map<string, { type: string }>
): ComponentDependency[] {
  const deps: ComponentDependency[] = [];

  // Tool headers don't reference other components - they're static values or credentials
  // Credential handling is done via envSettings.getEnvironmentCredential(), not component imports

  // Tools don't reference other components in the current schema
  // credentialReferenceId is handled via envSettings, not component imports

  return deps;
}

/**
 * Analyze what a function depends on
 */
function analyzeFunctionDependencies(
  functionId: string,
  functionData: any,
  availableComponents: Map<string, { type: string }>
): ComponentDependency[] {
  const deps: ComponentDependency[] = [];

  // Functions typically don't reference other components directly in the current schema
  // Add logic here if functions start referencing tools, data components, etc.

  return deps;
}

/**
 * Analyze what a data component depends on
 */
function analyzeDataComponentDependencies(
  componentId: string,
  componentData: any,
  availableComponents: Map<string, { type: string }>
): ComponentDependency[] {
  const deps: ComponentDependency[] = [];

  // Data components typically don't reference other components in the current schema
  // Add logic here if data components start having dependencies

  return deps;
}

/**
 * Analyze what an artifact component depends on
 */
function analyzeArtifactComponentDependencies(
  componentId: string,
  componentData: any,
  availableComponents: Map<string, { type: string }>
): ComponentDependency[] {
  const deps: ComponentDependency[] = [];

  // Artifact components typically don't reference other components in the current schema
  // Add logic here if artifact components start having dependencies

  return deps;
}

/**
 * Analyze what an external agent depends on
 */
function analyzeExternalAgentDependencies(
  agentId: string,
  agentData: any,
  availableComponents: Map<string, { type: string }>
): ComponentDependency[] {
  const deps: ComponentDependency[] = [];

  // External agents typically don't reference other components in the current schema
  // Add logic here if external agents start referencing tools, data components, etc.

  return deps;
}

/**
 * Check if a component needs environment settings import (for credentials)
 */
export function needsEnvironmentImport(componentData: any): boolean {
  // Check if component has credentialReferenceId
  if (componentData && componentData.credentialReferenceId) {
    return true;
  }
  
  // Check if agent has contextConfig with credentialReferenceId
  if (componentData && componentData.contextConfig && componentData.contextConfig.credentialReferenceId) {
    return true;
  }

  // Check if tool has headers with credentials
  if (componentData && componentData.headers) {
    for (const [key, value] of Object.entries(componentData.headers)) {
      if (typeof value === 'object' && value && 'credentialReferenceId' in value) {
        return true;
      }
    }
  }

  // Check if contextConfig has fetchDefinitions with credentials
  if (componentData && componentData.contextConfig && componentData.contextConfig.fetchDefinitions) {
    for (const fetchDef of componentData.contextConfig.fetchDefinitions) {
      if (fetchDef.credentialReferenceId) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get all credential IDs that a component references
 */
export function getReferencedCredentials(componentData: any): string[] {
  const credentials = new Set<string>();

  // Direct credentialReferenceId
  if (componentData && componentData.credentialReferenceId) {
    credentials.add(componentData.credentialReferenceId);
  }
  
  // Agent contextConfig credentialReferenceId
  if (componentData && componentData.contextConfig && componentData.contextConfig.credentialReferenceId) {
    credentials.add(componentData.contextConfig.credentialReferenceId);
  }

  // Tool headers credentials
  if (componentData && componentData.headers) {
    for (const [key, value] of Object.entries(componentData.headers)) {
      if (typeof value === 'object' && value && 'credentialReferenceId' in value && value.credentialReferenceId) {
        credentials.add(value.credentialReferenceId as string);
      }
    }
  }

  // ContextConfig fetchDefinitions credentials  
  if (componentData && componentData.contextConfig && componentData.contextConfig.fetchDefinitions) {
    for (const fetchDef of componentData.contextConfig.fetchDefinitions) {
      if (fetchDef.credentialReferenceId) {
        credentials.add(fetchDef.credentialReferenceId);
      }
    }
  }

  return Array.from(credentials);
}