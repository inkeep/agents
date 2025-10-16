/**
 * Variable Name Registry System
 *
 * Manages unique variable names across different entity types to prevent conflicts.
 * Example: ID "weather" can be used by both agent and subAgent, but variables must be unique.
 */

export type EntityType =
  | 'agent'
  | 'subAgent'
  | 'tool'
  | 'dataComponent'
  | 'artifactComponent'
  | 'statusComponent'
  | 'credential'
  | 'environment';

export interface VariableNameRegistry {
  // Map from ID to variable name for each entity type
  agents: Map<string, string>;
  subAgents: Map<string, string>;
  tools: Map<string, string>;
  dataComponents: Map<string, string>;
  artifactComponents: Map<string, string>;
  statusComponents: Map<string, string>;
  credentials: Map<string, string>;
  environments: Map<string, string>;

  // Reverse lookup: variable name -> { id, type }
  usedNames: Map<string, { id: string; type: EntityType }>;
  
  // Track used IDs across all entity types to detect collisions
  usedIds: Set<string>;
}

export interface NamingConventions {
  // Suffixes to add when conflicts are detected
  subAgentSuffix: string;
  agentSuffix: string;
  toolSuffix: string | null;
  dataComponentSuffix: string | null;
  artifactComponentSuffix: string | null;
  statusComponentSuffix: string | null;
  credentialSuffix: string | null;
  environmentSuffix: string | null;
}

export interface ConflictInfo {
  id: string;
  types: EntityType[];
  resolvedNames: Record<EntityType, string>;
  resolvedIds: Record<EntityType, string>;
}

/**
 * Default naming conventions (recommended pattern)
 */
export const DEFAULT_NAMING_CONVENTIONS: NamingConventions = {
  subAgentSuffix: 'SubAgent',
  agentSuffix: 'Agent',
  toolSuffix: null, // Usually no suffix needed
  dataComponentSuffix: null,
  artifactComponentSuffix: null,
  statusComponentSuffix: null,
  credentialSuffix: null,
  environmentSuffix: null, // No suffix needed for environments
};

/**
 * Variable Name Generator
 *
 * Generates unique variable names for entities and tracks conflicts
 */
export class VariableNameGenerator {
  private registry: VariableNameRegistry;
  private conventions: NamingConventions;
  private conflicts: ConflictInfo[];

  constructor(conventions: NamingConventions = DEFAULT_NAMING_CONVENTIONS) {
    this.registry = {
      agents: new Map(),
      subAgents: new Map(),
      tools: new Map(),
      dataComponents: new Map(),
      artifactComponents: new Map(),
      statusComponents: new Map(),
      credentials: new Map(),
      environments: new Map(),
      usedNames: new Map(),
      usedIds: new Set(),
    };
    this.conventions = conventions;
    this.conflicts = [];
  }

  /**
   * Generate unique ID for an entity
   * Adds suffix when ID conflicts are detected across entity types
   */
  generateUniqueId(originalId: string, entityType: EntityType): string {
    // Check if this ID is already used by any entity type
    if (!this.registry.usedIds.has(originalId)) {
      // No conflict - use original ID
      this.registry.usedIds.add(originalId);
      return originalId;
    }

    // Conflict detected - generate suffixed ID
    const suffix = this.getIdSuffixForType(entityType);
    const suffixedId = `${originalId}-${suffix.toLowerCase()}`;
    
    // If still conflict (rare), add number
    let finalId = suffixedId;
    let counter = 2;
    while (this.registry.usedIds.has(finalId)) {
      finalId = `${suffixedId}-${counter}`;
      counter++;
    }
    
    this.registry.usedIds.add(finalId);
    
    // Record the conflict for display
    const existingConflict = this.conflicts.find((c) => c.id === originalId);
    if (existingConflict) {
      existingConflict.types.push(entityType);
      existingConflict.resolvedIds[entityType] = finalId;
    } else {
      this.conflicts.push({
        id: originalId,
        types: [entityType],
        resolvedNames: {} as Record<EntityType, string>,
        resolvedIds: { [entityType]: finalId } as Record<EntityType, string>,
      });
    }
    
    return finalId;
  }

  /**
   * Generate unique variable name for an entity
   * Ensures no conflicts across all entity types
   */
  generateVariableName(id: string, entityType: EntityType, entityData?: any): string {
    // Check if already registered
    const registryMap = this.getRegistryMap(entityType);
    const existing = registryMap.get(id);
    if (existing) {
      return existing;
    }

    // For MCP tools with random IDs, use the human-readable name if available
    let baseName: string;
    if (entityType === 'tool' && entityData?.name && this.isRandomId(id)) {
      baseName = this.idToVariableName(entityData.name);
    } else {
      // Convert ID to base variable name (camelCase)
      baseName = this.idToVariableName(id);
    }

    // Check for conflicts
    if (!this.registry.usedNames.has(baseName)) {
      // No conflict - use base name
      this.register(id, baseName, entityType);
      return baseName;
    }

    // Conflict detected - add suffix based on conventions
    const existingEntity = this.registry.usedNames.get(baseName);
    if (existingEntity) {
      // Record the conflict
      const existingConflict = this.conflicts.find((c) => c.id === id);
      if (existingConflict) {
        existingConflict.types.push(entityType);
      } else {
        this.conflicts.push({
          id,
          types: [existingEntity.type, entityType],
          resolvedNames: {
            [existingEntity.type]: baseName,
          } as Record<EntityType, string>,
        });
      }
    }

    const suffix = this.getSuffixForType(entityType);
    const uniqueName = baseName + suffix;

    // If still conflict (rare), add number
    let finalName = uniqueName;
    let counter = 2;
    while (this.registry.usedNames.has(finalName)) {
      finalName = `${uniqueName}${counter}`;
      counter++;
    }

    this.register(id, finalName, entityType);

    // Update conflict info with resolved name
    const conflict = this.conflicts.find((c) => c.id === id);
    if (conflict) {
      conflict.resolvedNames[entityType] = finalName;
    }

    return finalName;
  }

  /**
   * Register an existing variable name (from detected patterns)
   */
  register(id: string, variableName: string, entityType: EntityType): void {
    const registryMap = this.getRegistryMap(entityType);
    registryMap.set(id, variableName);
    this.registry.usedNames.set(variableName, { id, type: entityType });
  }

  /**
   * Get the registry for lookup
   */
  getRegistry(): VariableNameRegistry {
    return this.registry;
  }

  /**
   * Get all conflicts that were resolved
   */
  getConflicts(): ConflictInfo[] {
    return this.conflicts;
  }

  /**
   * Convert ID to camelCase variable name
   */
  private idToVariableName(id: string): string {
    // Check if ID looks like a random/UUID (contains no meaningful separators)
    // If so, keep it as-is
    if (this.isRandomId(id)) {
      return id;
    }

    // Convert kebab-case or snake_case to camelCase
    // Examples:
    //   'my-weather-agent' -> 'myWeatherAgent'
    //   'my_weather_agent' -> 'myWeatherAgent'
    //   'MyWeatherAgent' -> 'myWeatherAgent'

    // Split on hyphens and underscores
    const parts = id.split(/[-_]/);

    // Convert to camelCase
    const camelCase = parts
      .map((part, index) => {
        if (index === 0) {
          // First part: lowercase
          return part.toLowerCase();
        }
        // Subsequent parts: capitalize first letter
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join('');

    return camelCase;
  }

  /**
   * Check if an ID looks random/UUID-like
   */
  private isRandomId(id: string): boolean {
    // If no hyphens or underscores and has mixed case or numbers, likely random
    if (!id.includes('-') && !id.includes('_')) {
      // Check if it has numbers or uppercase letters (indicating random)
      return /[0-9]/.test(id) || /[A-Z]/.test(id);
    }
    return false;
  }

  /**
   * Generate filename from entity data (for file naming)
   */
  generateFileName(id: string, entityType: EntityType, entityData?: any): string {
    let baseName: string;
    
    // For MCP tools with random IDs, use the human-readable name if available
    if (entityType === 'tool' && entityData?.name && this.isRandomId(id)) {
      baseName = this.nameToFileName(entityData.name);
    } else {
      baseName = this.idToFileName(id);
    }
    
    return baseName;
  }

  /**
   * Convert name to kebab-case filename
   */
  private nameToFileName(name: string): string {
    return name
      .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, hyphens
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/([a-z])([A-Z])/g, '$1-$2') // Convert camelCase to kebab-case
      .toLowerCase();
  }

  /**
   * Convert ID to kebab-case filename
   */
  private idToFileName(id: string): string {
    return id
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  /**
   * Get appropriate suffix for entity type (for variable names)
   */
  private getSuffixForType(entityType: EntityType): string {
    switch (entityType) {
      case 'agent':
        return this.conventions.agentSuffix;
      case 'subAgent':
        return this.conventions.subAgentSuffix;
      case 'tool':
        return this.conventions.toolSuffix || '';
      case 'dataComponent':
        return this.conventions.dataComponentSuffix || '';
      case 'artifactComponent':
        return this.conventions.artifactComponentSuffix || '';
      case 'statusComponent':
        return this.conventions.statusComponentSuffix || '';
      case 'credential':
        return this.conventions.credentialSuffix || '';
      case 'environment':
        return this.conventions.environmentSuffix || '';
      default:
        return '';
    }
  }

  /**
   * Get suffix for entity type (for ID suffixing)
   */
  private getIdSuffixForType(entityType: EntityType): string {
    switch (entityType) {
      case 'agent':
        return 'agent';
      case 'subAgent':
        return 'subagent';
      case 'tool':
        return 'tool';
      case 'dataComponent':
        return 'data';
      case 'artifactComponent':
        return 'artifact';
      case 'statusComponent':
        return 'status';
      case 'credential':
        return 'cred';
      case 'environment':
        return 'env';
      default:
        return 'item';
    }
  }

  /**
   * Get the appropriate registry map for an entity type
   */
  private getRegistryMap(entityType: EntityType): Map<string, string> {
    switch (entityType) {
      case 'agent':
        return this.registry.agents;
      case 'subAgent':
        return this.registry.subAgents;
      case 'tool':
        return this.registry.tools;
      case 'dataComponent':
        return this.registry.dataComponents;
      case 'artifactComponent':
        return this.registry.artifactComponents;
      case 'statusComponent':
        return this.registry.statusComponents;
      case 'credential':
        return this.registry.credentials;
      case 'environment':
        return this.registry.environments;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }
}

/**
 * Collect all entities from project data
 */
export function collectAllEntities(projectData: any): Array<{ id: string; type: EntityType; data?: any }> {
  const entities: Array<{ id: string; type: EntityType; data?: any }> = [];

  // Collect agents and their subAgents
  if (projectData.agents) {
    for (const [agentId, agentData] of Object.entries(projectData.agents)) {
      entities.push({ id: agentId, type: 'agent', data: agentData });

      const agentObj = agentData as any;
      if (agentObj.subAgents) {
        for (const [subAgentId, subAgentData] of Object.entries(agentObj.subAgents)) {
          entities.push({ id: subAgentId, type: 'subAgent', data: subAgentData });
        }
      }
    }
  }

  // Collect tools
  if (projectData.tools) {
    for (const [toolId, toolData] of Object.entries(projectData.tools)) {
      entities.push({ id: toolId, type: 'tool', data: toolData });
    }
  }

  // Collect data components
  if (projectData.dataComponents) {
    for (const [compId, compData] of Object.entries(projectData.dataComponents)) {
      entities.push({ id: compId, type: 'dataComponent', data: compData });
    }
  }

  // Collect artifact components
  if (projectData.artifactComponents) {
    for (const [compId, compData] of Object.entries(projectData.artifactComponents)) {
      entities.push({ id: compId, type: 'artifactComponent', data: compData });
    }
  }

   // Collect status components from agents (NOT subAgents - only agents have statusUpdates)
   if (projectData.agents) {
     for (const [_agentId, agentData] of Object.entries(projectData.agents)) {
       const agentObj = agentData as any;
       if (agentObj.statusUpdates?.statusComponents) {
         for (const statusComp of agentObj.statusUpdates.statusComponents) {
           // Status components use 'type' as their identifier
           if (statusComp.type) {
             entities.push({ id: statusComp.type, type: 'statusComponent' });
           }
         }
       }
     }
   }

  // Collect credentials from all sources that can reference them
  const credentialReferences = new Set<string>();
  
  // First check for direct credentialReferences structure
  if (projectData.credentialReferences) {
    for (const credId of Object.keys(projectData.credentialReferences)) {
      credentialReferences.add(credId);
    }
  }
  
  // Extract credentials from tools with credentialReferenceId
  if (projectData.tools) {
    for (const [_toolId, toolData] of Object.entries(projectData.tools)) {
      const tool = toolData as any;
      if (tool.credentialReferenceId) {
        credentialReferences.add(tool.credentialReferenceId);
      }
    }
  }
  
  // Extract credentials from external agents with credentialReferenceId
  if (projectData.externalAgents) {
    for (const [_agentId, agentData] of Object.entries(projectData.externalAgents)) {
      const agent = agentData as any;
      if (agent.credentialReferenceId) {
        credentialReferences.add(agent.credentialReferenceId);
      }
    }
  }
  
  // Extract credentials from agents and subAgents (check for contextConfig with credentials)
  if (projectData.agents) {
    for (const [_agentId, agentData] of Object.entries(projectData.agents)) {
      const agent = agentData as any;
      
      // Check agent's contextConfig for credentials
      if (agent.contextConfig?.headers?.credentialReferenceId) {
        credentialReferences.add(agent.contextConfig.headers.credentialReferenceId);
      }
      if (agent.contextConfig?.contextVariables) {
        for (const [_varId, varData] of Object.entries(agent.contextConfig.contextVariables)) {
          const contextVar = varData as any;
          if (contextVar.credentialReferenceId) {
            credentialReferences.add(contextVar.credentialReferenceId);
          }
        }
      }
      
      // Check subAgents for credentials
      if (agent.subAgents) {
        for (const [_subAgentId, subAgentData] of Object.entries(agent.subAgents)) {
          const subAgent = subAgentData as any;
          
          // Check subAgent's contextConfig for credentials
          if (subAgent.contextConfig?.headers?.credentialReferenceId) {
            credentialReferences.add(subAgent.contextConfig.headers.credentialReferenceId);
          }
          if (subAgent.contextConfig?.contextVariables) {
            for (const [_varId, varData] of Object.entries(subAgent.contextConfig.contextVariables)) {
              const contextVar = varData as any;
              if (contextVar.credentialReferenceId) {
                credentialReferences.add(contextVar.credentialReferenceId);
              }
            }
          }
        }
      }
    }
  }
  
  // Don't add credentials as separate entities - they are embedded in environment files
  // Credentials are passed as data to environment generation, not as separate file entities


  return entities;
}
