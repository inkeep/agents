/**
 * Project Comparator - Direct component comparison
 * 
 * Uses direct component-by-component comparison instead of regex parsing
 * of difference strings. Based on pull-v2's compareProjectDefinitions approach.
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import type { ComponentRegistry } from './utils/component-registry';

export interface ComponentChange {
  componentType: ComponentType;
  componentId: string;
  changeType: 'added' | 'modified' | 'deleted';
  isNested?: boolean; // true if this is nested within another component (e.g., agent.functionTools)
  parentComponent?: string; // e.g., 'agent:my-agent' if nested
  changedFields?: FieldChange[]; // detailed field-level changes
  summary?: string; // human-readable summary of changes
}

export interface FieldChange {
  field: string; // dot-notation field path (e.g., 'models.smart', 'canUse[0].toolId')
  changeType: 'added' | 'modified' | 'deleted';
  oldValue?: any;
  newValue?: any;
  description?: string; // human-readable description
}

export interface ProjectComparison {
  hasChanges: boolean;
  changeCount: number;
  changes: ComponentChange[];
  rawDifferences: string[]; // the raw difference strings from compareProjectDefinitions
  componentChanges: {
    agents: { added: string[]; modified: string[]; deleted: string[] };
    subAgents: { added: string[]; modified: string[]; deleted: string[] };
    tools: { added: string[]; modified: string[]; deleted: string[] };
    functionTools: { added: string[]; modified: string[]; deleted: string[] };
    functions: { added: string[]; modified: string[]; deleted: string[] };
    dataComponents: { added: string[]; modified: string[]; deleted: string[] };
    artifactComponents: { added: string[]; modified: string[]; deleted: string[] };
    statusComponents: { added: string[]; modified: string[]; deleted: string[] };
    environments: { added: string[]; modified: string[]; deleted: string[] };
    contextConfigs: { added: string[]; modified: string[]; deleted: string[] };
    fetchDefinitions: { added: string[]; modified: string[]; deleted: string[] };
    headers: { added: string[]; modified: string[]; deleted: string[] };
    credentials: { added: string[]; modified: string[]; deleted: string[] };
    externalAgents: { added: string[]; modified: string[]; deleted: string[] };
    models: { added: string[]; modified: string[]; deleted: string[] };
  };
}

type ComponentType = 
  | 'agent' 
  | 'subAgent'
  | 'tool' 
  | 'functionTool'
  | 'function'
  | 'dataComponent' 
  | 'artifactComponent' 
  | 'statusComponent' 
  | 'environment' 
  | 'contextConfig' 
  | 'fetchDefinition' 
  | 'header' 
  | 'credential'
  | 'externalAgent'
  | 'models';

/**
 * Compare two projects and classify all changes using direct component comparison
 */
export async function compareProjects(
  localProject: FullProjectDefinition | null,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry | null,
  debug: boolean = false
): Promise<ProjectComparison> {
  if (debug) {
    console.log(chalk.gray('\n🔍 Comparing local and remote projects...'));
  }

  // If no local project, everything is new
  if (!localProject) {
    return createNewProjectComparison(remoteProject, debug);
  }

  // Direct component-by-component comparison
  const changes = compareComponentsDirectly(localProject, remoteProject, localRegistry, debug);
  const componentChanges = groupChangesByType(changes);

  if (debug) {
    console.log(chalk.gray(`   Found ${changes.length} changes`));
    console.log(chalk.gray(`   Changes: ${JSON.stringify(changes, null, 2)}`));
  }

  return {
    hasChanges: changes.length > 0,
    changeCount: changes.length,
    changes,
    rawDifferences: [], // No raw differences with direct comparison
    componentChanges,
  };
}

/**
 * Handle new project case (everything is added)
 */
function createNewProjectComparison(project: FullProjectDefinition, debug: boolean): ProjectComparison {

  const changes: ComponentChange[] = [];

  // Add all agents
  if (project.agents) {
    Object.keys(project.agents).forEach(agentId => {
      changes.push({
        componentType: 'agent',
        componentId: agentId,
        changeType: 'added',
      });
    });
  }

  // Add all tools
  if (project.tools) {
    Object.keys(project.tools).forEach(toolId => {
      changes.push({
        componentType: 'tool',
        componentId: toolId,
        changeType: 'added',
      });
    });
  }

  // Add all function tools (including hoisted from agents)
  if (project.functionTools) {
    Object.keys(project.functionTools).forEach(toolId => {
      changes.push({
        componentType: 'functionTool',
        componentId: toolId,
        changeType: 'added',
      });
    });
  }

  // Add all functions (execution code for function tools)
  if (project.functions) {
    Object.keys(project.functions).forEach(funcId => {
      changes.push({
        componentType: 'function',
        componentId: funcId,
        changeType: 'added',
      });
    });
  }

  // Add all data components
  if (project.dataComponents) {
    Object.keys(project.dataComponents).forEach(componentId => {
      changes.push({
        componentType: 'dataComponent',
        componentId: componentId,
        changeType: 'added',
      });
    });
  }

  // Add all artifact components
  if (project.artifactComponents) {
    Object.keys(project.artifactComponents).forEach(componentId => {
      changes.push({
        componentType: 'artifactComponent',
        componentId: componentId,
        changeType: 'added',
      });
    });
  }

  // Add sub-agents (extracted from agents)
  if (project.agents) {
    Object.entries(project.agents).forEach(([agentId, agentData]) => {
      if (agentData.subAgents) {
        Object.keys(agentData.subAgents).forEach(subAgentId => {
          changes.push({
            componentType: 'subAgent',
            componentId: subAgentId,
            changeType: 'added',
          });
        });
      }
    });
  }

  // Add status components (extracted from agents)
  const statusComponents = extractStatusComponentIds(project);
  statusComponents.forEach(componentId => {
    changes.push({
      componentType: 'statusComponent',
      componentId: componentId,
      changeType: 'added',
    });
  });

  // Add context configs (extracted from agents)
  if (project.agents) {
    Object.entries(project.agents).forEach(([agentId, agentData]) => {
      if (agentData.contextConfig) {
        const contextConfigId = agentData.contextConfig.id; // Use actual contextConfig.id
        if (!contextConfigId) {
          console.warn(`contextConfig for agent ${agentId} is missing required id field`);
          return; // Skip this contextConfig if no ID
        }
        changes.push({
          componentType: 'contextConfig',
          componentId: contextConfigId,
          changeType: 'added',
        });
      }
    });
  }

  // Add external agents
  if (project.externalAgents) {
    Object.keys(project.externalAgents).forEach(extAgentId => {
      changes.push({
        componentType: 'externalAgent',
        componentId: extAgentId,
        changeType: 'added',
      });
    });
  }

  // Add environments/credentials
  if (project.credentialReferences) {
    Object.keys(project.credentialReferences).forEach(credId => {
      changes.push({
        componentType: 'credential',
        componentId: credId,
        changeType: 'added',
      });
    });
  }

  const componentChanges = groupChangesByType(changes);

  return {
    hasChanges: true,
    changeCount: changes.length,
    changes,
    rawDifferences: [],
    componentChanges,
  };
}

/**
 * Direct component-by-component comparison
 */
function compareComponentsDirectly(
  localProject: FullProjectDefinition,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry | null,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];


  // Compare each component type
  changes.push(...compareAgents(localProject.agents || {}, remoteProject.agents || {}, debug));
  changes.push(...compareSubAgents(localProject.agents || {}, remoteProject.agents || {}, debug));
  changes.push(...compareTools(localProject.tools || {}, remoteProject.tools || {}, debug));
  changes.push(...compareFunctionTools(localProject.functionTools || {}, remoteProject.functionTools || {}, debug));
  changes.push(...compareFunctions(localProject.functions || {}, remoteProject.functions || {}, debug));
  changes.push(...compareDataComponents(localProject.dataComponents || {}, remoteProject.dataComponents || {}, debug));
  changes.push(...compareArtifactComponents(localProject.artifactComponents || {}, remoteProject.artifactComponents || {}, debug));
  changes.push(...compareCredentials(localProject.credentialReferences || {}, remoteProject.credentialReferences || {}, debug));

  changes.push(...compareExternalAgents(localProject.externalAgents || {}, remoteProject.externalAgents || {}, debug));
  // Extract status components from agents for comparison
  const localStatusComponents = extractStatusComponentsFromProject(localProject);
  const remoteStatusComponents = extractStatusComponentsFromProject(remoteProject);
  changes.push(...compareStatusComponents(localStatusComponents, remoteStatusComponents, debug));

  // Compare contextConfig and fetchDefinition components separately
  changes.push(...compareContextConfigs(localProject, remoteProject, localRegistry, debug));
  changes.push(...compareFetchDefinitions(localProject, remoteProject, debug));
  
  // Compare project-level models
  changes.push(...compareProjectModels(localProject.models, remoteProject.models, debug));
  
  // Compare project-level fields
  changes.push(...compareProjectFields(localProject, remoteProject, debug));

  return changes;
}

/**
 * Compare agents between local and remote
 */
function compareAgents(
  localAgents: Record<string, any>,
  remoteAgents: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];
  const localIds = Object.keys(localAgents);
  const remoteIds = Object.keys(remoteAgents);


  // Find added agents
  remoteIds.filter(id => !localIds.includes(id)).forEach(id => {
    const agent = remoteAgents[id];
    changes.push({ 
      componentType: 'agent', 
      componentId: id, 
      changeType: 'added',
      summary: `New agent: ${agent.name || id}`
    });
  });

  // Find deleted agents
  localIds.filter(id => !remoteIds.includes(id)).forEach(id => {
    const agent = localAgents[id];
    changes.push({ 
      componentType: 'agent', 
      componentId: id, 
      changeType: 'deleted',
      summary: `Removed agent: ${agent.name || id}`
    });
  });

  // Find modified agents with detailed field changes
  const commonIds = localIds.filter(id => remoteIds.includes(id));
  commonIds.forEach(id => {
    
    const fieldChanges = getDetailedFieldChanges('', localAgents[id], remoteAgents[id]);
    if (fieldChanges.length > 0) {
      const summary = generateAgentChangeSummary(fieldChanges);
      changes.push({ 
        componentType: 'agent', 
        componentId: id, 
        changeType: 'modified',
        changedFields: fieldChanges,
        summary
      });
      
    }
  });

  return changes;
}

/**
 * Compare subAgents between local and remote
 * Extracts subAgents from all agents and compares them as separate components
 */
function compareSubAgents(
  localAgents: Record<string, any>,
  remoteAgents: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];
  
  // Extract all subAgents from local agents
  const localSubAgents: Record<string, any> = {};
  for (const [agentId, agentData] of Object.entries(localAgents)) {
    if (agentData.subAgents) {
      for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
        localSubAgents[subAgentId] = subAgentData;
      }
    }
  }
  
  // Extract all subAgents from remote agents
  const remoteSubAgents: Record<string, any> = {};
  for (const [agentId, agentData] of Object.entries(remoteAgents)) {
    if (agentData.subAgents) {
      for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
        remoteSubAgents[subAgentId] = subAgentData;
      }
    }
  }
  
  const localIds = Object.keys(localSubAgents);
  const remoteIds = Object.keys(remoteSubAgents);
  
  
  // Find added subAgents
  remoteIds.filter(id => !localIds.includes(id)).forEach(id => {
    const subAgent = remoteSubAgents[id];
    changes.push({ 
      componentType: 'subAgent', 
      componentId: id, 
      changeType: 'added',
      summary: `New subAgent: ${subAgent.name || id}`
    });
  });
  
  // Find deleted subAgents
  localIds.filter(id => !remoteIds.includes(id)).forEach(id => {
    const subAgent = localSubAgents[id];
    changes.push({ 
      componentType: 'subAgent', 
      componentId: id, 
      changeType: 'deleted',
      summary: `Removed subAgent: ${subAgent.name || id}`
    });
  });
  
  // Find modified subAgents with detailed field changes
  const commonIds = localIds.filter(id => remoteIds.includes(id));
  commonIds.forEach(id => {
    const fieldChanges = getDetailedFieldChanges('', localSubAgents[id], remoteSubAgents[id]);
    if (fieldChanges.length > 0) {
      const summary = generateSubAgentChangeSummary(fieldChanges);
      changes.push({ 
        componentType: 'subAgent', 
        componentId: id, 
        changeType: 'modified',
        changedFields: fieldChanges,
        summary
      });
      
    }
  });
  
  return changes;
}

/**
 * Generate a summary for subAgent changes
 */
function generateSubAgentChangeSummary(fieldChanges: FieldChange[]): string {
  const changeTypes = new Set(fieldChanges.map(c => c.changeType));
  const fieldNames = fieldChanges.map(c => c.field.split('.')[0]).filter((value, index, self) => self.indexOf(value) === index);
  
  if (changeTypes.has('modified') && fieldNames.length === 1) {
    return `Modified ${fieldNames[0]}`;
  } else if (changeTypes.has('added') && changeTypes.has('deleted')) {
    return `Updated configuration (${fieldChanges.length} changes)`;
  } else if (changeTypes.has('added')) {
    return `Added ${fieldNames.join(', ')}`;
  } else if (changeTypes.has('deleted')) {
    return `Removed ${fieldNames.join(', ')}`;
  } else {
    return `Modified ${fieldNames.join(', ')}`;
  }
}

/**
 * Compare tools between local and remote
 */
function compareTools(
  localTools: Record<string, any>,
  remoteTools: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  return compareComponentMaps('tool', localTools, remoteTools, debug);
}

/**
 * Compare function tools between local and remote
 */
function compareFunctionTools(
  localFunctionTools: Record<string, any>,
  remoteFunctionTools: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  return compareComponentMaps('functionTool', localFunctionTools, remoteFunctionTools, debug);
}

/**
 * Compare functions between local and remote
 */
function compareFunctions(
  localFunctions: Record<string, any>,
  remoteFunctions: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  // Clean functions data by removing metadata fields that belong to functionTools
  const cleanLocalFunctions: Record<string, any> = {};
  const cleanRemoteFunctions: Record<string, any> = {};
  
  // Clean local functions
  for (const [id, func] of Object.entries(localFunctions)) {
    cleanLocalFunctions[id] = {
      id: func.id,
      inputSchema: func.inputSchema,
      executeCode: func.executeCode,
      dependencies: func.dependencies
    };
  }
  
  // Clean remote functions
  for (const [id, func] of Object.entries(remoteFunctions)) {
    cleanRemoteFunctions[id] = {
      id: func.id,
      inputSchema: func.inputSchema,
      executeCode: func.executeCode,
      dependencies: func.dependencies
    };
  }

  return compareComponentMaps('function', cleanLocalFunctions, cleanRemoteFunctions, debug);
}

/**
 * Compare data components between local and remote
 */
function compareDataComponents(
  localDataComponents: Record<string, any>,
  remoteDataComponents: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  return compareComponentMaps('dataComponent', localDataComponents, remoteDataComponents, debug);
}

/**
 * Compare artifact components between local and remote
 */
function compareArtifactComponents(
  localArtifactComponents: Record<string, any>,
  remoteArtifactComponents: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  return compareComponentMaps('artifactComponent', localArtifactComponents, remoteArtifactComponents, debug);
}

/**
 * Compare credentials between local and remote
 */
function compareCredentials(
  localCredentials: Record<string, any>,
  remoteCredentials: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  return compareComponentMaps('credential', localCredentials, remoteCredentials, debug);
}

/**
 * Compare external agents between local and remote
 */
function compareExternalAgents(
  localExternalAgents: Record<string, any>,
  remoteExternalAgents: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  return compareComponentMaps('externalAgent', localExternalAgents, remoteExternalAgents, debug);
}

/**
 * Compare status components between local and remote
 */
function compareStatusComponents(
  localStatusComponents: Record<string, any>,
  remoteStatusComponents: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  return compareComponentMaps('statusComponent', localStatusComponents, remoteStatusComponents, debug);
}

/**
 * Compare project-level models
 */
function compareProjectModels(
  localModels: any,
  remoteModels: any,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];
  
  // Get detailed field changes for models
  const fieldChanges = getDetailedFieldChanges('', localModels, remoteModels);
  
  if (fieldChanges.length > 0) {
    const summary = generateModelsChangeSummary(fieldChanges);
    
    
    changes.push({
      componentType: 'models',
      componentId: 'project',
      changeType: 'modified',
      changedFields: fieldChanges,
      summary
    });
  }
  
  return changes;
}

/**
 * Generate summary for model changes
 */
function generateModelsChangeSummary(fieldChanges: FieldChange[]): string {
  const modelTypes: string[] = [];
  
  fieldChanges.forEach(change => {
    const field = change.field;
    if (field.includes('base')) modelTypes.push('base model');
    else if (field.includes('structuredOutput')) modelTypes.push('structured output model');
    else if (field.includes('model')) modelTypes.push('model configuration');
  });
  
  const uniqueTypes = [...new Set(modelTypes)];
  if (uniqueTypes.length > 0) {
    return `Updated ${uniqueTypes.join(', ')}`;
  }
  
  return `${fieldChanges.length} model configuration changes`;
}

/**
 * Compare project-level fields like name, description, etc.
 */
function compareProjectFields(
  localProject: FullProjectDefinition,
  remoteProject: FullProjectDefinition,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];
  
  // Compare basic project fields
  const projectFields = ['name', 'description', 'stopWhen'];
  
  for (const field of projectFields) {
    const oldValue = (localProject as any)[field];
    const newValue = (remoteProject as any)[field];
    
    if (!deepEqual(oldValue, newValue)) {
      const fieldChanges = getDetailedFieldChanges('', oldValue, newValue);
      if (fieldChanges.length > 0) {
        const summary = `Project ${field} updated`;
        
        changes.push({
          componentType: 'contextConfig', // Use contextConfig as catch-all for project-level changes
          componentId: `project-${field}`,
          changeType: 'modified',
          changedFields: fieldChanges,
          summary
        });
        
      }
    }
  }
  
  return changes;
}

/**
 * Generic component map comparison with detailed field tracking
 */
function compareComponentMaps(
  componentType: ComponentType,
  localMap: Record<string, any>,
  remoteMap: Record<string, any>,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];
  const localIds = Object.keys(localMap);
  const remoteIds = Object.keys(remoteMap);


  // Find added components
  remoteIds.filter(id => !localIds.includes(id)).forEach(id => {
    const component = remoteMap[id];
    const summary = generateComponentSummary(componentType, 'added', component);
    changes.push({ 
      componentType, 
      componentId: id, 
      changeType: 'added',
      summary
    });
  });

  // Find deleted components
  localIds.filter(id => !remoteIds.includes(id)).forEach(id => {
    const component = localMap[id];
    const summary = generateComponentSummary(componentType, 'deleted', component);
    changes.push({ 
      componentType, 
      componentId: id, 
      changeType: 'deleted',
      summary
    });
  });

  // Find modified components with detailed field changes
  const commonIds = localIds.filter(id => remoteIds.includes(id));
  commonIds.forEach(id => {
    const fieldChanges = getDetailedFieldChanges('', localMap[id], remoteMap[id]);
    if (fieldChanges.length > 0) {
      const summary = generateComponentChangeSummary(componentType, fieldChanges);
      changes.push({ 
        componentType, 
        componentId: id, 
        changeType: 'modified',
        changedFields: fieldChanges,
        summary
      });
      
    }
  });

  return changes;
}

/**
 * Check if a value is considered "empty" (null, undefined, empty array, empty object)
 */
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return true;
  return false;
}

/**
 * Compare arrays as sets (order-independent) using a key function to identify items
 */
function compareArraysAsSet(
  basePath: string,
  oldArray: any[],
  newArray: any[],
  depth: number
): FieldChange[] {
  const changes: FieldChange[] = [];
  
  // Create a key function to uniquely identify array items
  const getItemKey = (item: any): string => {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
      // For relationship objects, use identifying fields
      if (item.toolId) return `tool:${item.toolId}`;
      if (item.agentId) return `agent:${item.agentId}`;
      if (item.externalAgentId) return `external:${item.externalAgentId}`;
      if (item.subAgentId) return `subagent:${item.subAgentId}`;
      if (item.id) return item.id;
      if (item.type) return `type:${item.type}`;
      // Fallback to JSON for other objects
      return JSON.stringify(item);
    }
    return String(item);
  };
  
  // Create maps for easier comparison
  const oldMap = new Map<string, any>();
  const newMap = new Map<string, any>();
  
  oldArray.forEach((item, index) => {
    const key = getItemKey(item);
    oldMap.set(key, { item, index });
  });
  
  newArray.forEach((item, index) => {
    const key = getItemKey(item);
    newMap.set(key, { item, index });
  });
  
  // Find added items
  for (const [key, { item }] of newMap) {
    if (!oldMap.has(key)) {
      changes.push({
        field: `${basePath}[+${key}]`,
        changeType: 'added',
        newValue: item,
        description: `Added array item: ${formatValue(item)}`
      });
    }
  }
  
  // Find removed items
  for (const [key, { item }] of oldMap) {
    if (!newMap.has(key)) {
      changes.push({
        field: `${basePath}[-${key}]`,
        changeType: 'deleted',
        oldValue: item,
        description: `Removed array item: ${formatValue(item)}`
      });
    }
  }
  
  // Find modified items (same key, different content)
  for (const [key, { item: newItem }] of newMap) {
    if (oldMap.has(key)) {
      const { item: oldItem } = oldMap.get(key)!;
      const itemChanges = getDetailedFieldChanges(`${basePath}[${key}]`, oldItem, newItem, depth + 1);
      changes.push(...itemChanges);
    }
  }
  
  return changes;
}

/**
 * Get detailed field-level changes between two objects
 */
function getDetailedFieldChanges(
  basePath: string,
  oldObj: any,
  newObj: any,
  depth: number = 0
): FieldChange[] {
  const changes: FieldChange[] = [];
  
  
  // Prevent infinite recursion
  if (depth > 10) return changes;
  
  // Ignore database/SDK generated fields that shouldn't affect comparison
  const ignoredFields = [
    // Database-generated IDs
    'agentToolRelationId', 
    'subAgentExternalAgentRelationId',
    'subAgentTeamAgentRelationId', 
    'subAgentToolRelationId',
    'agentExternalAgentRelationId',
    'teamAgentRelationId',
    '_agentId',
    'teamAgents',
    // SDK-generated metadata
    'type', 
    // Runtime context fields
    'tenantId', 
    'projectId', 
    'agentId',
    // Runtime/error fields
    'lastError',
    // ContextConfig implementation details (ID changes are acceptable)
    'contextConfig.id',
    'lastErrorAt',
    'status',
    'usedBy', // Computed field
    // Agent-level fields that shouldn't be compared (tools only for sub-agents via canUse)
    'tools', // Tools are handled at project level and sub-agent level via canUse
    'teamAgents', // Team relationships are handled elsewhere
    // Timestamps
    'createdAt', 
    'updatedAt'
  ];
  
  // Handle empty value equivalence - null, undefined, [], {} are all considered "empty"
  const oldIsEmpty = isEmpty(oldObj);
  const newIsEmpty = isEmpty(newObj);
  
  // If both are empty, no change
  if (oldIsEmpty && newIsEmpty) {
    return changes;
  }
  
  // If only one is empty and the other has meaningful content, that's a change
  if (oldIsEmpty && !newIsEmpty) {
    const fieldPath = basePath || 'root';
    changes.push({
      field: fieldPath,
      changeType: 'added',
      oldValue: oldObj,
      newValue: newObj,
      description: `Added: ${formatValue(newObj)}`
    });
    return changes;
  }
  
  if (!oldIsEmpty && newIsEmpty) {
    const fieldPath = basePath || 'root';
    changes.push({
      field: fieldPath,
      changeType: 'deleted',
      oldValue: oldObj,
      newValue: newObj,
      description: `Removed: ${formatValue(oldObj)}`
    });
    return changes;
  }
  
  // Handle arrays - all arrays are order-independent by default
  if (Array.isArray(oldObj) && Array.isArray(newObj)) {
    // Special handling for canDelegateTo arrays - normalize enriched vs non-enriched forms
    if (basePath.endsWith('canDelegateTo')) {
      const normalizedOld = normalizeCanDelegateTo(oldObj);
      const normalizedNew = normalizeCanDelegateTo(newObj);
      return compareArraysAsSet(basePath, normalizedOld, normalizedNew, depth);
    }
    return compareArraysAsSet(basePath, oldObj, newObj, depth);
  }
  
  // Handle objects
  if (typeof oldObj === 'object' && typeof newObj === 'object') {
    const oldKeys = Object.keys(oldObj);
    const newKeys = Object.keys(newObj);
    const allKeys = [...new Set([...oldKeys, ...newKeys])];
    
    for (const key of allKeys) {
      const fieldPath = basePath ? `${basePath}.${key}` : key;
      
      
      // Check if this field path should be ignored
      const shouldIgnore = ignoredFields.some(ignored => {
        // Exact field path match (e.g., "contextConfig.id")
        if (fieldPath === ignored) return true;
        
        // Exact key match (e.g., "status", "createdAt")
        if (key === ignored) return true;
        
        // For nested paths, check if we're at that exact path
        if (ignored.includes('.') && fieldPath === ignored) return true;
        
        return false;
      });
      
      if (shouldIgnore) {
        if (basePath === '' && key === 'statusUpdates') {
          console.log(`   ⚠️ statusUpdates field is being IGNORED due to ignored fields check`);
        }
        continue; // Skip this field
      }
      
      const oldValue = oldObj[key];
      const newValue = newObj[key];
      
      if (!(key in oldObj)) {
        // Only report as added if the new value is not empty
        if (!isEmpty(newValue)) {
          changes.push({
            field: fieldPath,
            changeType: 'added',
            newValue: newValue,
            description: `Added field: ${formatValue(newValue)}`
          });
        }
      } else if (!(key in newObj)) {
        // Only report as deleted if the old value was not empty
        if (!isEmpty(oldValue)) {
          changes.push({
            field: fieldPath,
            changeType: 'deleted',
            oldValue: oldValue,
            description: `Removed field: ${formatValue(oldValue)}`
          });
        }
      } else {
        // Both exist, compare recursively
        const recursiveChanges = getDetailedFieldChanges(fieldPath, oldValue, newValue, depth + 1);
        changes.push(...recursiveChanges);
      }
    }
    return changes;
  }
  
  // Handle primitives
  if (oldObj !== newObj) {
    const fieldPath = basePath || 'value';
    changes.push({
      field: fieldPath,
      changeType: 'modified',
      oldValue: oldObj,
      newValue: newObj,
      description: `Changed from ${formatValue(oldObj)} to ${formatValue(newObj)}`
    });
  }
  
  return changes;
}

/**
 * Format a value for display in change descriptions
 */
function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 50) {
      return `"${value.substring(0, 47)}..."`;
    }
    return `"${value}"`;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.length === 1) {
        const firstItem = value[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          const keys = Object.keys(firstItem);
          if (keys.length > 0) {
            return `[{${keys.slice(0, 2).join(', ')}${keys.length > 2 ? ', ...' : ''}}]`;
          }
        }
        return `["${String(firstItem).substring(0, 20)}..."]`;
      }
      // For multiple items, show a sample
      const firstItem = value[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        const keys = Object.keys(firstItem);
        return `[{${keys.slice(0, 2).join(', ')}}, ...] (${value.length} items)`;
      }
      return `[${value.length} items]`;
    }
    if (Object.keys(value).length === 0) return '{}';
    const keys = Object.keys(value);
    
    // Show key-value pairs for small objects
    if (keys.length <= 3) {
      const pairs = keys.map(key => {
        const val = value[key];
        if (typeof val === 'string') {
          return `${key}: "${val.length > 15 ? val.substring(0, 12) + '...' : val}"`;
        } else if (typeof val === 'object' && val !== null) {
          return `${key}: {...}`;
        } else {
          return `${key}: ${val}`;
        }
      });
      return `{${pairs.join(', ')}}`;
    }
    
    // For larger objects, just show key names
    if (keys.length <= 5) {
      return `{${keys.join(', ')}}`;
    }
    return `{${keys.slice(0, 3).join(', ')}, ...} (${keys.length} fields)`;
  }
  return String(value);
}

/**
 * Generate human-readable summary for agent changes
 */
function generateAgentChangeSummary(fieldChanges: FieldChange[]): string {
  const summaryParts: string[] = [];
  
  // Check for important field changes
  const nameChange = fieldChanges.find(c => c.field === 'name');
  const promptChange = fieldChanges.find(c => c.field === 'prompt');
  const modelChanges = fieldChanges.filter(c => c.field.startsWith('models'));
  const toolChanges = fieldChanges.filter(c => c.field.includes('canUse') || c.field.includes('tools'));
  const subAgentChanges = fieldChanges.filter(c => c.field.includes('subAgents') || c.field.includes('canDelegateTo'));
  
  if (nameChange) summaryParts.push('name updated');
  if (promptChange) summaryParts.push('prompt changed');
  if (modelChanges.length > 0) summaryParts.push(`${modelChanges.length} model changes`);
  if (toolChanges.length > 0) summaryParts.push(`${toolChanges.length} tool changes`);
  if (subAgentChanges.length > 0) summaryParts.push(`${subAgentChanges.length} sub-agent changes`);
  
  if (summaryParts.length === 0) {
    return `${fieldChanges.length} field changes`;
  }
  
  return summaryParts.join(', ');
}

/**
 * Generate summary for component addition/deletion
 */
function generateComponentSummary(componentType: ComponentType, changeType: 'added' | 'deleted', component: any): string {
  const name = component?.name || component?.id || 'unnamed';
  const action = changeType === 'added' ? 'Added' : 'Removed';
  
  if (componentType === 'tool') {
    const toolType = component?.config?.type || 'unknown type';
    return `${action} ${toolType} tool: ${name}`;
  }
  
  return `${action} ${componentType}: ${name}`;
}

/**
 * Generate summary for component modifications
 */
function generateComponentChangeSummary(componentType: ComponentType, fieldChanges: FieldChange[]): string {
  if (componentType === 'tool') {
    const configChanges = fieldChanges.filter(c => c.field.startsWith('config'));
    if (configChanges.length > 0) {
      return `Configuration updated (${configChanges.length} changes)`;
    }
  }
  
  return `${fieldChanges.length} field changes`;
}

/**
 * Deep equality check for component comparison with empty value equivalence
 */
function deepEqual(a: any, b: any): boolean {
  // Handle empty value equivalence first
  const aIsEmpty = isEmpty(a);
  const bIsEmpty = isEmpty(b);
  
  // If both are empty, they're equal
  if (aIsEmpty && bIsEmpty) {
    return true;
  }
  
  // If only one is empty, they're not equal
  if (aIsEmpty !== bIsEmpty) {
    return false;
  }
  
  // Both have content, check for detailed changes
  const changes = getDetailedFieldChanges('', a, b);
  return changes.length === 0;
}

/**
 * Extract status component IDs from agents
 */
function extractStatusComponentIds(project: FullProjectDefinition): string[] {
  const statusComponentIds: string[] = [];
  
  if (!project.agents) return statusComponentIds;
  
  for (const agentData of Object.values(project.agents)) {
    if ((agentData as any).statusUpdates?.statusComponents) {
      for (const statusComp of (agentData as any).statusUpdates.statusComponents) {
        const statusCompId = statusComp.type || statusComp.id;
        if (statusCompId && !statusComponentIds.includes(statusCompId)) {
          statusComponentIds.push(statusCompId);
        }
      }
    }
  }
  
  return statusComponentIds;
}

/**
 * Extract actual status component data from agents for comparison
 */
function extractStatusComponentsFromProject(project: FullProjectDefinition): Record<string, any> {
  const statusComponents: Record<string, any> = {};
  
  if (!project.agents) {
    return statusComponents;
  }
  
  for (const [_, agentData] of Object.entries(project.agents)) {
    if ((agentData as any).statusUpdates?.statusComponents) {
      for (const statusComp of (agentData as any).statusUpdates.statusComponents) {
        const statusCompId = statusComp.type || statusComp.id;
        if (statusCompId) {
          statusComponents[statusCompId] = statusComp;
        }
      }
    }
  }  
  return statusComponents;
}

/**
 * Group changes by component type for easier processing
 */
function groupChangesByType(changes: ComponentChange[]): ProjectComparison['componentChanges'] {
  const result = createEmptyComponentChanges();
  
  // Map singular ComponentType to plural componentChanges keys
  const typeMapping: Record<string, keyof ProjectComparison['componentChanges']> = {
    'agent': 'agents',
    'subAgent': 'subAgents',
    'tool': 'tools', 
    'functionTool': 'functionTools',
    'function': 'functions',
    'dataComponent': 'dataComponents',
    'artifactComponent': 'artifactComponents',
    'statusComponent': 'statusComponents',
    'environment': 'environments',
    'contextConfig': 'contextConfigs',
    'fetchDefinition': 'fetchDefinitions',
    'header': 'headers',
    'credential': 'credentials',
    'externalAgent': 'externalAgents',
    'models': 'models'
  };
  
  changes.forEach(change => {
    const groupKey = typeMapping[change.componentType];
    const group = result[groupKey];
    if (group && !group[change.changeType].includes(change.componentId)) {
      group[change.changeType].push(change.componentId);
    }
  });
  
  return result;
}

/**
 * Create empty component changes structure
 */
function createEmptyComponentChanges(): ProjectComparison['componentChanges'] {
  return {
    agents: { added: [], modified: [], deleted: [] },
    subAgents: { added: [], modified: [], deleted: [] },
    tools: { added: [], modified: [], deleted: [] },
    functionTools: { added: [], modified: [], deleted: [] },
    functions: { added: [], modified: [], deleted: [] },
    dataComponents: { added: [], modified: [], deleted: [] },
    artifactComponents: { added: [], modified: [], deleted: [] },
    statusComponents: { added: [], modified: [], deleted: [] },
    environments: { added: [], modified: [], deleted: [] },
    contextConfigs: { added: [], modified: [], deleted: [] },
    fetchDefinitions: { added: [], modified: [], deleted: [] },
    headers: { added: [], modified: [], deleted: [] },
    credentials: { added: [], modified: [], deleted: [] },
    externalAgents: { added: [], modified: [], deleted: [] },
    models: { added: [], modified: [], deleted: [] },
  };
}

/**
 * Truncate long descriptions for better readability
 */
function truncateDescription(description: string): string {
  if (description.length <= 80) return description;
  return description.substring(0, 77) + '...';
}

/**
 * Group agent field changes by category for better visualization
 */
function groupAgentChangesByCategory(fieldChanges: FieldChange[]): Record<string, FieldChange[]> {
  const categories: Record<string, FieldChange[]> = {
    'Configuration': [],
    'Tools & Relationships': [],
    'Models': [],
    'Context & Data': [],
    'Other': []
  };
  
  fieldChanges.forEach(change => {
    const field = change.field.toLowerCase();
    
    if (field.includes('model') || field.includes('provider')) {
      categories['Models'].push(change);
    } else if (field.includes('tool') || field.includes('canuse') || field.includes('candelegateto') || field.includes('subagent') || field.includes('teamagent')) {
      categories['Tools & Relationships'].push(change);
    } else if (field.includes('context') || field.includes('data') || field.includes('fetch') || field.includes('header')) {
      categories['Context & Data'].push(change);
    } else if (field.includes('name') || field.includes('prompt') || field.includes('description') || field.includes('stopwhen')) {
      categories['Configuration'].push(change);
    } else {
      categories['Other'].push(change);
    }
  });
  
  // Remove empty categories
  Object.keys(categories).forEach(key => {
    if (categories[key].length === 0) {
      delete categories[key];
    }
  });
  
  return categories;
}

/**
 * Get icon for change category
 */
function getCategoryIcon(category: string): string {
  switch (category) {
    case 'Configuration': return '⚙️ ';
    case 'Models': return '🧠';
    case 'Tools & Relationships': return '🔗';
    case 'Context & Data': return '📊';
    default: return '📝';
  }
}

/**
 * Get icon for component type
 */
function getComponentIcon(componentType: string): string {
  switch (componentType) {
    case 'agent': return '🤖';
    case 'tool': return '🛠️ ';
    case 'functionTool': return '⚡';
    case 'dataComponent': return '📊';
    case 'artifactComponent': return '📄';
    case 'credential': return '🔑';
    case 'contextConfig': return '⚙️ ';
    case 'fetchDefinition': return '🔄';
    case 'models': return '🧠';
    default: return '📦';
  }
}

/**
 * Compare contextConfig components across agents
 */
function compareContextConfigs(
  localProject: FullProjectDefinition,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry | null,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];
  
  // Match contextConfigs by agent ID - each agent can have at most one contextConfig
  const agentIds = new Set([
    ...Object.keys(localProject.agents || {}),
    ...Object.keys(remoteProject.agents || {})
  ]);
  
  agentIds.forEach(agentId => {
    const localAgent = localProject.agents?.[agentId];
    const remoteAgent = remoteProject.agents?.[agentId];
    
    const localContextConfig = localAgent?.contextConfig;
    const remoteContextConfig = remoteAgent?.contextConfig;
    
    // Use the actual contextConfig.id (now required)
    const contextId = localContextConfig?.id || remoteContextConfig?.id;
    if (!contextId) {
      console.warn(`contextConfig for agent ${agentId} is missing required id field`);
      return; // Skip if no valid contextId
    }
    
    if (!localContextConfig && remoteContextConfig) {
      changes.push({
        componentType: 'contextConfig' as ComponentType,
        componentId: contextId,
        changeType: 'added',
        summary: `Added contextConfig for agent: ${agentId}`
      });
    } else if (localContextConfig && !remoteContextConfig) {
      changes.push({
        componentType: 'contextConfig' as ComponentType,
        componentId: contextId,
        changeType: 'deleted',
        summary: `Removed contextConfig for agent: ${agentId}`
      });
    } else if (localContextConfig && remoteContextConfig) {
      // Use detailed field changes to respect ignored fields
      const fieldChanges = getDetailedFieldChanges('', localContextConfig, remoteContextConfig);
      
      // Filter out contextConfig id changes specifically (only for contextConfig comparison)
      const filteredChanges = fieldChanges.filter(change => change.field !== 'id');
      
      if (filteredChanges.length > 0) {
        changes.push({
          componentType: 'contextConfig' as ComponentType,
          componentId: contextId,
          changeType: 'modified',
          changedFields: filteredChanges,
          summary: `Modified contextConfig for agent: ${agentId} (${filteredChanges.length} changes)`
        });
      }
    }
  });
  
  return changes;
}

/**
 * Compare fetchDefinition components across contextConfigs
 */
function compareFetchDefinitions(
  localProject: FullProjectDefinition,
  remoteProject: FullProjectDefinition,
  debug: boolean
): ComponentChange[] {
  const changes: ComponentChange[] = [];
  const fetchDefinitions = new Map<string, { local?: any; remote?: any }>();
  
  // Helper to extract fetchDefinitions from contextConfig
  const extractFetchDefinitions = (contextConfig: any) => {
    const fetchDefs: any[] = [];
    if (contextConfig && typeof contextConfig === 'object' && contextConfig.contextVariables) {
      Object.values(contextConfig.contextVariables).forEach((variable: any) => {
        if (variable && typeof variable === 'object' && variable.id && variable.fetchConfig) {
          fetchDefs.push(variable);
        }
      });
    }
    return fetchDefs;
  };
  
  // Collect fetchDefinitions from both projects
  Object.entries(localProject.agents || {}).forEach(([agentId, agentData]) => {
    if (agentData.contextConfig) {
      const fetchDefs = extractFetchDefinitions(agentData.contextConfig);
      fetchDefs.forEach((fetchDef: any) => {
        if (!fetchDefinitions.has(fetchDef.id)) {
          fetchDefinitions.set(fetchDef.id, {});
        }
        fetchDefinitions.get(fetchDef.id)!.local = fetchDef;
      });
    }
  });
  
  Object.entries(remoteProject.agents || {}).forEach(([agentId, agentData]) => {
    if (agentData.contextConfig) {
      const fetchDefs = extractFetchDefinitions(agentData.contextConfig);
      fetchDefs.forEach((fetchDef: any) => {
        if (!fetchDefinitions.has(fetchDef.id)) {
          fetchDefinitions.set(fetchDef.id, {});
        }
        fetchDefinitions.get(fetchDef.id)!.remote = fetchDef;
      });
    }
  });
  
  // Compare each fetchDefinition
  fetchDefinitions.forEach((configs, fetchId) => {
    const { local, remote } = configs;
    
    if (!local && remote) {
      changes.push({
        componentType: 'fetchDefinition' as ComponentType,
        componentId: fetchId,
        changeType: 'added',
        summary: `Added fetchDefinition: ${fetchId}`
      });
    } else if (local && !remote) {
      changes.push({
        componentType: 'fetchDefinition' as ComponentType,
        componentId: fetchId,
        changeType: 'deleted',
        summary: `Removed fetchDefinition: ${fetchId}`
      });
    } else if (local && remote) {
      const localStr = JSON.stringify(local, null, 2);
      const remoteStr = JSON.stringify(remote, null, 2);
      if (localStr !== remoteStr) {
        changes.push({
          componentType: 'fetchDefinition' as ComponentType,
          componentId: fetchId,
          changeType: 'modified',
          summary: `Modified fetchDefinition: ${fetchId}`
        });
      }
    }
  });
  
  return changes;
}

/**
 * Normalize canDelegateTo array to handle enriched vs non-enriched forms
 * Converts both [{subAgentId: "id"}] and ["id"] to the same normalized form
 */
function normalizeCanDelegateTo(canDelegateTo: any[]): string[] {
  return canDelegateTo.map(item => {
    if (typeof item === 'string') {
      return item;
    }
    if (typeof item === 'object' && item !== null) {
      // Extract the ID from enriched objects
      return item.subAgentId || item.agentId || item.externalAgentId || String(item);
    }
    return String(item);
  });
}
