/**
 * Unified Component Registry - Handles both unique variable names AND file paths
 * 
 * This combines the functionality of ComponentTracker and ComponentMapper
 * into a single, clean system that handles:
 * 1. Unique variable name generation (with collision resolution)
 * 2. File path tracking for imports
 * 3. Reference resolution for code generation
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';

export type ComponentType = 
  | 'agent' 
  | 'subAgent' 
  | 'tool' 
  | 'functionTool'
  | 'dataComponent' 
  | 'artifactComponent' 
  | 'statusComponent'
  | 'externalAgent'
  | 'credential'
  | 'contextConfig'
  | 'fetchDefinition'
  | 'headers'
  | 'project';

export interface ComponentInfo {
  id: string;           // Original component ID
  name: string;         // Unique variable name (guaranteed unique across project)
  type: ComponentType;  // Component type
  filePath: string;     // Relative file path (e.g., "agents/foo.ts")
  exportName: string;   // Export name (usually same as name)
  isInline: boolean;    // Whether component was defined inline (true) or exported (false)
}

export class ComponentRegistry {
  private components = new Map<string, ComponentInfo>();
  private usedNames = new Set<string>(); // Global name registry for uniqueness

  /**
   * Register a component with both unique name and file path
   */
  register(
    id: string, 
    type: ComponentType, 
    filePath: string, 
    exportName?: string,
    isInline: boolean = false
  ): ComponentInfo {
    let name: string;
    let actualExportName: string;
    
    if (exportName) {
      // If we have an actual variable name (exported or declared), use it directly
      name = exportName;
      actualExportName = exportName;
    } else {
      // For truly inline components (no variable name), generate a unique name from ID
      const baseName = this.toCamelCase(id);
      const uniqueName = this.ensureUniqueName(baseName, type);
      name = uniqueName;
      actualExportName = uniqueName;
    }
    
    
    const info: ComponentInfo = {
      id,
      name,
      type,
      filePath,
      exportName: actualExportName,
      isInline
    };
    
    this.components.set(id, info);
    this.usedNames.add(name);
    if (actualExportName && actualExportName !== name) {
      this.usedNames.add(actualExportName);
    }
    
    return info;
  }

  /**
   * Get component info by ID
   */
  get(id: string): ComponentInfo | undefined {
    return this.components.get(id);
  }

  /**
   * Get unique variable name for a component
   */
  getVariableName(id: string): string | undefined {
    return this.components.get(id)?.name;
  }

  /**
   * Get import statement for a component
   */
  getImportStatement(fromFilePath: string, componentId: string): string | undefined {
    const component = this.get(componentId);
    if (!component) return undefined;

    const relativePath = this.calculateRelativeImport(fromFilePath, component.filePath);
    return `import { ${component.exportName} } from '${relativePath}';`;
  }

  /**
   * Format an array of references for code generation
   */
  formatReferencesForCode(
    references: any[], 
    style: { quotes: 'single' | 'double'; indentation: string }, 
    indentLevel: number
  ): string {
    if (!Array.isArray(references) || references.length === 0) {
      return '[]';
    }

    const variableNames = this.extractVariableNames(references);
    
    if (variableNames.length === 0) {
      return '[]';
    }

    if (variableNames.length === 1) {
      return `[${variableNames[0]}]`;
    }

    // Multi-line format
    const { indentation } = style;
    const indent = indentation.repeat(indentLevel);
    const lines = ['['];
    
    for (let i = 0; i < variableNames.length; i++) {
      const isLast = i === variableNames.length - 1;
      lines.push(`${indent}${variableNames[i]}${isLast ? '' : ','}`);
    }
    
    lines.push(`${indentation.repeat(indentLevel - 1)}]`);
    return lines.join('\n');
  }

  /**
   * Get all import statements needed for a file
   */
  getImportsForFile(fromFilePath: string, referencedIds: string[]): string[] {
    const imports: string[] = [];
    const seenImports = new Set<string>(); // Deduplicate imports
    
    for (const id of referencedIds) {
      const importStatement = this.getImportStatement(fromFilePath, id);
      if (importStatement && !seenImports.has(importStatement)) {
        imports.push(importStatement);
        seenImports.add(importStatement);
      }
    }
    
    return imports;
  }

  /**
   * Extract component IDs from references and get their variable names
   */
  private extractVariableNames(references: any[]): string[] {
    const variableNames: string[] = [];
    
    for (const ref of references) {
      const id = this.extractIdFromReference(ref);
      if (id) {
        const component = this.get(id);
        if (component) {
          variableNames.push(component.name);
        } else {
          // Fallback to camelCase if not found in registry
          console.warn(`ComponentRegistry: Component not found: ${id}`);
          variableNames.push(this.toCamelCase(id));
        }
      }
    }
    
    return variableNames;
  }

  /**
   * Get all component IDs referenced in arrays for import generation
   */
  getReferencedComponentIds(referenceArrays: any[][]): string[] {
    const componentIds: string[] = [];
    
    for (const refArray of referenceArrays) {
      if (Array.isArray(refArray)) {
        for (const ref of refArray) {
          const id = this.extractIdFromReference(ref);
          if (id) {
            componentIds.push(id);
          }
        }
      }
    }
    
    return componentIds;
  }

  /**
   * Extract ID from a reference (string or object) based on component type
   */
  private extractIdFromReference(ref: any): string | null {
    if (typeof ref === 'string') {
      return ref;
    } else if (typeof ref === 'object' && ref) {
      // Handle different component types by their specific ID fields (confirmed from debug output)
      
      // Tool references (MCP tools and function tools)
      if (ref.toolId) return ref.toolId;
      
      // Agent references (main agents and sub-agents)
      if (ref.agentId) return ref.agentId;
      
      // External agent references
      if (ref.externalAgentId) return ref.externalAgentId;
      
      // Credential store references (found in generated files)
      if (ref.credentialStoreId) return ref.credentialStoreId;
      
      // Status component references using type field (confirmed from debug output)
      if (ref.type && !ref.agentId && !ref.toolId && !ref.externalAgentId) return ref.type;
      
      // Generic ID field (fallback)
      if (ref.id) return ref.id;
      
      // Name field (fallback)
      if (ref.name) return ref.name;
      
      // For objects without recognized ID fields, warn and skip
      console.warn('ComponentRegistry: Reference without recognized ID field:', ref);
      return null;
    }
    
    return null;
  }

  /**
   * Convert string to camelCase and ensure it's a valid JavaScript identifier
   */
  private toCamelCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^[0-9]/, '_$&');
  }

  /**
   * Ensure a name is unique by adding prefixes/suffixes if needed
   */
  private ensureUniqueName(baseName: string, type: ComponentType): string {
    let uniqueName = baseName;
    let counter = 1;
    
    while (this.usedNames.has(uniqueName)) {
      // Try with type prefix first
      if (counter === 1) {
        const typePrefix = this.getTypePrefix(type);
        uniqueName = `${typePrefix}${baseName.charAt(0).toUpperCase() + baseName.slice(1)}`;
      } else {
        // Then try with counter
        uniqueName = `${baseName}${counter}`;
      }
      counter++;
      
      // Safety net to prevent infinite loops
      if (counter > 100) {
        uniqueName = `${baseName}_${Date.now()}`;
        break;
      }
    }
    
    return uniqueName;
  }

  /**
   * Get type prefix for uniqueness resolution
   */
  private getTypePrefix(type: ComponentType): string {
    switch (type) {
      case 'agent': return 'agent';
      case 'subAgent': return 'sub';
      case 'externalAgent': return 'ext';
      case 'tool': return 'tool';
      case 'functionTool': return 'func';
      case 'dataComponent': return 'data';
      case 'artifactComponent': return 'artifact';
      case 'credential': return 'cred';
      case 'statusComponent': return 'status';
      case 'contextConfig': return 'context';
      case 'project': return 'project';
      default: return 'comp';
    }
  }

  /**
   * Calculate relative import path between files
   */
  private calculateRelativeImport(fromPath: string, toPath: string): string {
    // Remove .ts extensions for calculation
    const fromParts = fromPath.replace('.ts', '').split('/');
    const toParts = toPath.replace('.ts', '').split('/');
    
    // Remove filename from fromPath (keep directory only)
    fromParts.pop();
    
    // Calculate relative path
    let relativePath = '';
    
    // Go up directories from fromPath
    for (let i = 0; i < fromParts.length; i++) {
      relativePath += '../';
    }
    
    // Add target path
    relativePath += toParts.join('/');
    
    // Clean up path format
    if (relativePath.startsWith('../')) {
      return relativePath;
    } else {
      return './' + relativePath;
    }
  }

  /**
   * Get all components for debugging
   */
  getAllComponents(): ComponentInfo[] {
    return Array.from(this.components.values());
  }

  /**
   * Clear all components (for testing)
   */
  clear(): void {
    this.components.clear();
    this.usedNames.clear();
  }
}

/**
 * Register all components from a project with their file paths
 */
export function registerAllComponents(
  project: FullProjectDefinition,
  registry: ComponentRegistry
): void {
  // Register project
  registry.register(project.id, 'project', 'index.ts');

  // Register credentials
  if (project.credentialReferences) {
    for (const credId of Object.keys(project.credentialReferences)) {
      registry.register(credId, 'credential', `credentials/${credId}.ts`);
    }
  }

  // Register tools
  if (project.tools) {
    for (const toolId of Object.keys(project.tools)) {
      registry.register(toolId, 'tool', `tools/${toolId}.ts`);
    }
  }

  // Register function tools
  if (project.functions) {
    for (const funcId of Object.keys(project.functions)) {
      registry.register(funcId, 'functionTool', `tools/functions/${funcId}.ts`);
    }
  }

  // Register data components
  if (project.dataComponents) {
    for (const componentId of Object.keys(project.dataComponents)) {
      registry.register(componentId, 'dataComponent', `data-components/${componentId}.ts`);
    }
  }

  // Register artifact components
  if (project.artifactComponents) {
    for (const componentId of Object.keys(project.artifactComponents)) {
      registry.register(componentId, 'artifactComponent', `artifact-components/${componentId}.ts`);
    }
  }

  // Register external agents
  if (project.externalAgents) {
    for (const extAgentId of Object.keys(project.externalAgents)) {
      registry.register(extAgentId, 'externalAgent', `external-agents/${extAgentId}.ts`);
    }
  }

  // Register extracted status components
  const statusComponents = extractStatusComponents(project);
  for (const statusId of Object.keys(statusComponents)) {
    registry.register(statusId, 'statusComponent', `status-components/${statusId}.ts`);
  }

  // Register agents
  if (project.agents) {
    for (const agentId of Object.keys(project.agents)) {
      registry.register(agentId, 'agent', `agents/${agentId}.ts`);
    }
  }

  // Register extracted sub-agents
  const subAgents = extractSubAgents(project);
  for (const subAgentId of Object.keys(subAgents)) {
    registry.register(subAgentId, 'subAgent', `agents/sub-agents/${subAgentId}.ts`);
  }

  // Register extracted context configs
  const contextConfigs = extractContextConfigs(project);
  for (const contextId of Object.keys(contextConfigs)) {
    registry.register(contextId, 'contextConfig', `context-configs/${contextId}.ts`);
  }
}

/**
 * Extract status components from project agents
 */
function extractStatusComponents(project: FullProjectDefinition): Record<string, any> {
  const statusComponents: Record<string, any> = {};
  
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.statusUpdates && agentData.statusUpdates.statusComponents) {
        // statusComponents is an array that can contain strings or objects
        for (const statusComp of agentData.statusUpdates.statusComponents) {
          let statusId: string;
          
          if (typeof statusComp === 'string') {
            // Direct string reference to status component ID
            statusId = statusComp;
          } else if (typeof statusComp === 'object' && statusComp) {
            // Object with id, type, or name field
            statusId = statusComp.type;
          } else {
            continue;
          }
          
          if (statusId && !statusComponents[statusId]) {
            // Use the actual status component data instead of creating dummy data
            statusComponents[statusId] = {
              // Include any other properties from the actual data first
              ...statusComp,
              id: statusId,
              type: statusComp.type || statusId,
              description: statusComp.description || `Status component for ${statusId}`,
              detailsSchema: statusComp.detailsSchema,
            };
          }
        }
      }
    }
  }
  
  return statusComponents;
}

/**
 * Extract sub-agents from project agents
 */
function extractSubAgents(project: FullProjectDefinition): Record<string, any> {
  const subAgents: Record<string, any> = {};
  
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.subAgents) {
        for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
          subAgents[subAgentId] = subAgentData;
        }
      }
    }
  }
  
  return subAgents;
}

/**
 * Extract context configs from project agents
 */
function extractContextConfigs(project: FullProjectDefinition): Record<string, any> {
  const contextConfigs: Record<string, any> = {};
  
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.contextConfig) {
        // Always use agent-based key for consistent registry lookup
        const contextConfigKey = `${agentId}Context`;
        contextConfigs[contextConfigKey] = agentData.contextConfig;
      }
    }
  }
  
  return contextConfigs;
}