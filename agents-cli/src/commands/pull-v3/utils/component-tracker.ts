/**
 * Component Tracker - Track generated components and their imports
 * 
 * This utility tracks all generated components so that references between
 * components can be properly resolved to import statements.
 */

export interface ComponentInfo {
  id: string;
  name: string; // camelCase variable name
  type: 'agent' | 'subAgent' | 'externalAgent' | 'tool' | 'functionTool' | 'dataComponent' | 'artifactComponent' | 'credential' | 'statusComponent' | 'contextConfig';
  filePath: string; // relative import path
  exportName: string; // the actual exported constant name
}

export class ComponentTracker {
  private components = new Map<string, ComponentInfo>();
  private usedNames = new Set<string>(); // Track used variable names for uniqueness
  
  /**
   * Register a component in the tracker
   */
  register(info: ComponentInfo): void {
    // Ensure unique variable name
    const uniqueName = this.ensureUniqueName(info.name, info.type);
    const uniqueExportName = this.ensureUniqueName(info.exportName, info.type);
    
    const updatedInfo = {
      ...info,
      name: uniqueName,
      exportName: uniqueExportName
    };
    
    this.components.set(info.id, updatedInfo);
    this.usedNames.add(uniqueName);
    this.usedNames.add(uniqueExportName);
  }
  
  /**
   * Ensure a variable name is unique across the project
   */
  private ensureUniqueName(baseName: string, type: ComponentInfo['type']): string {
    let uniqueName = baseName;
    let counter = 1;
    
    while (this.usedNames.has(uniqueName)) {
      // Add type prefix or counter to make unique
      if (counter === 1) {
        // Try adding type prefix first
        const typePrefix = this.getTypePrefix(type);
        uniqueName = `${typePrefix}${baseName.charAt(0).toUpperCase() + baseName.slice(1)}`;
      } else {
        // Add counter
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
  private getTypePrefix(type: ComponentInfo['type']): string {
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
      default: return 'comp';
    }
  }
  
  /**
   * Get component info by ID
   */
  get(id: string): ComponentInfo | undefined {
    return this.components.get(id);
  }
  
  /**
   * Check if component exists
   */
  has(id: string): boolean {
    return this.components.has(id);
  }
  
  /**
   * Get all components of a specific type
   */
  getByType(type: ComponentInfo['type']): ComponentInfo[] {
    return Array.from(this.components.values()).filter(c => c.type === type);
  }
  
  /**
   * Extract IDs from mixed array (objects with id property or strings)
   */
  extractIds(references: any[]): string[] {
    if (!Array.isArray(references)) {
      return [];
    }
    
    return references.map(ref => {
      if (typeof ref === 'string') {
        return ref;
      } else if (typeof ref === 'object' && ref) {
        // Try various properties to find the ID
        if (ref.id) {
          return ref.id;
        } else if (ref.type) {
          return ref.type;
        } else if (ref.name) {
          return ref.name;
        } else {
          // For objects without clear IDs, skip them rather than return [object Object]
          console.warn('ComponentTracker: Skipping reference without clear ID:', ref);
          return null;
        }
      } else {
        return null;
      }
    }).filter(Boolean) as string[];
  }
  
  /**
   * Resolve references to import statements and variable names
   */
  resolveReferences(references: any[], currentFilePath: string): {
    imports: string[];
    variableNames: string[];
  } {
    const ids = this.extractIds(references);
    const imports: string[] = [];
    const variableNames: string[] = [];
    
    for (const id of ids) {
      const component = this.get(id);
      if (component) {
        // Calculate relative import path
        const importPath = this.getRelativeImportPath(currentFilePath, component.filePath);
        imports.push(`import { ${component.exportName} } from '${importPath}';`);
        variableNames.push(component.name);
      } else {
        // Component not found - use the ID as-is (might be external reference)
        variableNames.push(id);
      }
    }
    
    return { imports, variableNames };
  }
  
  /**
   * Generate formatted array of variable names for code generation
   */
  formatReferencesForCode(references: any[], style: { quotes: 'single' | 'double'; indentation: string }, indentLevel: number): string {
    const ids = this.extractIds(references);
    const variableNames: string[] = [];
    
    for (const id of ids) {
      const component = this.get(id);
      if (component) {
        variableNames.push(component.name);
      } else {
        // Use ID as-is for external references
        variableNames.push(id);
      }
    }
    
    if (variableNames.length === 0) {
      return '[]';
    }
    
    const { indentation } = style;
    const indent = indentation.repeat(indentLevel);
    
    if (variableNames.length === 1) {
      return `[${variableNames[0]}]`;
    }
    
    // Multi-line format
    const lines = ['['];
    for (const name of variableNames) {
      lines.push(`${indent}${name},`);
    }
    // Remove trailing comma
    if (lines.length > 1 && lines[lines.length - 1].endsWith(',')) {
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
    }
    lines.push(`${indentation.repeat(indentLevel - 1)}]`);
    
    return lines.join('\n');
  }
  
  /**
   * Calculate relative import path between files
   */
  getRelativeImportPath(fromPath: string, toPath: string): string {
    // Simple implementation - assumes both paths are relative to project root
    const fromParts = fromPath.replace('.ts', '').split('/');
    const toParts = toPath.replace('.ts', '').split('/');
    
    // Remove filename from fromPath
    fromParts.pop();
    
    // Calculate relative path
    let relativePath = '';
    
    // Go up directories
    for (let i = 0; i < fromParts.length; i++) {
      relativePath += '../';
    }
    
    // Add target path
    relativePath += toParts.join('/');
    
    // Clean up path
    if (relativePath.startsWith('../')) {
      return relativePath;
    } else {
      return './' + relativePath;
    }
  }
  
  /**
   * Get all components as a list
   */
  getAllComponents(): ComponentInfo[] {
    return Array.from(this.components.values());
  }
  
  /**
   * Clear all registered components
   */
  clear(): void {
    this.components.clear();
  }
}

/**
 * Convert kebab-case or snake_case to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}