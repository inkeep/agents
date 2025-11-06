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

// Use SDK function names directly instead of plural forms
export type ComponentType =
  | 'agent'
  | 'subAgent'
  | 'tool'
  | 'functionTool'
  | 'function'
  | 'dataComponent'
  | 'artifactComponent'
  | 'statusComponent'
  | 'environment'
  | 'externalAgent'
  | 'credential'
  | 'contextConfig'
  | 'fetchDefinition'
  | 'header'
  | 'model'
  | 'project'
  | 'mcpTool'
  | 'registerEnvironmentSettings'
  | 'createEnvironmentSettings';

export interface ComponentInfo {
  id: string; // Original component ID
  name: string; // Unique variable name (guaranteed unique across project)
  type: ComponentType; // Component type
  filePath: string; // Relative file path (e.g., "agents/foo.ts")
  exportName: string; // Export name (usually same as name)
  isInline: boolean; // Whether component was defined inline (true) or exported (false)
}

export class ComponentRegistry {
  private components = new Map<string, ComponentInfo>();
  private componentsByTypeAndId = new Map<string, ComponentInfo>(); // Type-aware lookup
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
    const typeKey = `${type}:${id}`;

    // Check if this component already exists - if so, return the existing one
    const existing = this.componentsByTypeAndId.get(typeKey);
    if (existing) {
      return existing;
    }

    let name: string;
    let actualExportName: string;

    // If exportName is provided (real discovered name), use it directly
    // Otherwise, generate and ensure uniqueness for assumed names
    if (exportName) {
      // Real export name discovered from file - use it as-is
      name = exportName;
      actualExportName = exportName;
    } else {
      // No real export name - generate unique name with prefixes if needed
      const baseName = this.toCamelCase(id);
      const uniqueName = this.ensureUniqueName(baseName, type);
      console.log(
        `🔧 Registry: ${type}:${id} -> baseName: "${baseName}" -> uniqueName: "${uniqueName}"`
      );
      name = uniqueName;
      actualExportName = uniqueName;
    }

    const info: ComponentInfo = {
      id,
      name,
      type,
      filePath,
      exportName: actualExportName,
      isInline,
    };

    // Store with both ID-only key (for backward compatibility) and type+ID key (for collision handling)
    this.components.set(id, info);
    this.componentsByTypeAndId.set(typeKey, info);

    this.usedNames.add(name);
    if (actualExportName && actualExportName !== name) {
      this.usedNames.add(actualExportName);
    }

    return info;
  }

  /**
   * Get component info by ID and type
   */
  get(id: string, type: ComponentType): ComponentInfo | undefined {
    const typeKey = `${type}:${id}`;
    return this.componentsByTypeAndId.get(typeKey);
  }

  /**
   * Get component info by variable name (since variable names are globally unique)
   */
  getByVariableName(variableName: string): ComponentInfo | undefined {
    for (const component of this.componentsByTypeAndId.values()) {
      if (component.name === variableName) {
        return component;
      }
    }
    return undefined;
  }

  /**
   * Get unique variable name for a component by ID and type
   */
  getVariableName(id: string, type: ComponentType): string | undefined {
    const typeKey = `${type}:${id}`;
    const result = this.componentsByTypeAndId.get(typeKey)?.name;

    return result;
  }

  /**
   * Get all components in the registry
   */
  getAll(): ComponentInfo[] {
    return Array.from(this.componentsByTypeAndId.values());
  }

  /**
   * Get import statement for a component
   */
  getImportStatement(
    fromFilePath: string,
    componentId: string,
    componentType: ComponentType
  ): string | undefined {
    const component = this.get(componentId, componentType);
    if (!component) return undefined;

    const relativePath = this.calculateRelativeImport(fromFilePath, component.filePath);
    const importStmt = `import { ${component.exportName} } from '${relativePath}';`;
    return importStmt;
  }

  /**
   * Format an array of references for code generation
   */
  formatReferencesForCode(
    references: any[],
    componentType: ComponentType,
    style: { quotes: 'single' | 'double'; indentation: string },
    indentLevel: number
  ): string {
    if (!Array.isArray(references) || references.length === 0) {
      return '[]';
    }

    const variableNames: string[] = [];

    for (const ref of references) {
      const id = this.extractIdFromReference(ref);
      if (id) {
        const component = this.get(id, componentType);
        if (component) {
          variableNames.push(component.name);
        } else {
          console.warn(`ComponentRegistry: Component not found: ${id} (type: ${componentType})`);
          variableNames.push(this.toCamelCase(id));
        }
      }
    }

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
  getImportsForFile(
    fromFilePath: string,
    referencedComponents: Array<{ id: string; type: ComponentType }>
  ): string[] {
    const imports: string[] = [];
    const seenImports = new Set<string>(); // Deduplicate imports

    for (const { id, type } of referencedComponents) {
      const importStatement = this.getImportStatement(fromFilePath, id, type);
      if (importStatement && !seenImports.has(importStatement)) {
        imports.push(importStatement);
        seenImports.add(importStatement);
      }
    }

    return imports;
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
      case 'agent':
        return 'agent';
      case 'subAgent':
        return 'sub';
      case 'externalAgent':
        return 'ext';
      case 'tool':
        return 'tool';
      case 'functionTool':
        return 'func';
      case 'dataComponent':
        return 'data';
      case 'artifactComponent':
        return 'artifact';
      case 'statusComponent':
        return 'status';
      case 'environment':
        return 'env';
      case 'credential':
        return 'cred';
      case 'contextConfig':
        return 'context';
      case 'fetchDefinition':
        return 'fetch';
      case 'header':
        return 'header';
      case 'model':
        return 'model';
      case 'project':
        return 'project';
      default:
        return 'comp';
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
    return Array.from(this.componentsByTypeAndId.values());
  }

  /**
   * Clear all components (for testing)
   */
  clear(): void {
    this.components.clear();
    this.componentsByTypeAndId.clear();
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

  // Register function tools - prevent double registration
  const processedFunctionIds = new Set<string>();

  // Register functions first (they take priority)
  if (project.functions) {
    for (const funcId of Object.keys(project.functions)) {
      registry.register(funcId, 'functionTool', `tools/functions/${funcId}.ts`);
      processedFunctionIds.add(funcId);
    }
  }

  // Register functionTools (only if not already registered)
  if (project.functionTools) {
    for (const funcToolId of Object.keys(project.functionTools)) {
      if (!processedFunctionIds.has(funcToolId)) {
        registry.register(funcToolId, 'functionTool', `tools/functions/${funcToolId}.ts`);
      }
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
      console.log(`🔧 Registering agent: ${agentId}`);
      registry.register(agentId, 'agent', `agents/${agentId}.ts`);
    }
  }

  // Register extracted sub-agents
  const subAgents = extractSubAgents(project);
  console.log(`🔧 Found subAgents:`, Object.keys(subAgents));
  for (const subAgentId of Object.keys(subAgents)) {
    console.log(`🔧 Registering subAgent: ${subAgentId}`);
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
export function extractSubAgents(project: FullProjectDefinition): Record<string, any> {
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
        // Use the actual contextConfig.id (now required)
        const contextConfigId = agentData.contextConfig.id;
        if (contextConfigId) {
          contextConfigs[contextConfigId] = agentData.contextConfig;
        } else {
          console.warn(`contextConfig for agent ${agentId} is missing required 'id' field`);
        }
      }
    }
  }

  return contextConfigs;
}

/**
 * Find sub-agent data with parent agent info for contextConfig resolution
 */
export function findSubAgentWithParent(
  project: FullProjectDefinition,
  subAgentId: string
): { subAgentData: any; parentAgentId: string; contextConfigData?: any } | undefined {
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.subAgents && agentData.subAgents[subAgentId]) {
        // Get contextConfig data if parent agent has one with an ID
        const contextConfigData = agentData.contextConfig?.id ? agentData.contextConfig : undefined;

        return {
          subAgentData: agentData.subAgents[subAgentId],
          parentAgentId: agentId,
          contextConfigData,
        };
      }
    }
  }
  return undefined;
}
