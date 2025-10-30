/**
 * Component Parser - Find all component definitions (exported and inline)
 * Maps components by looking for patterns like:
 * - export const myTool = tool({id: 'tool-id', ...})
 * - dataComponent({id: 'data-id', ...}) (inline)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { ComponentRegistry, type ComponentType } from './utils/component-registry';
import chalk from 'chalk';

interface ComponentMatch {
  id: string;
  type: ComponentType;
  filePath: string;
  variableName?: string; // If exported
  startLine: number;
  isInline: boolean; // true if not exported, false if exported
}

/**
 * Component type mapping from function names to ComponentType
 */
const COMPONENT_TYPE_MAP: Record<string, ComponentType> = {
  'project': 'project',
  'agent': 'agent', 
  'subAgent': 'subAgent',
  'tool': 'tool',
  'mcpTool': 'tool', // MCP tools are a type of tool
  'functionTool': 'functionTool',
  'dataComponent': 'dataComponent',
  'artifactComponent': 'artifactComponent',
  'statusComponent': 'statusComponent',
  'externalAgent': 'externalAgent',
  'credential': 'credential',
  'contextConfig': 'contextConfig',
  'fetchDefinition': 'fetchDefinition',
  'headers': 'headers'
};

/**
 * Parse a single file for all component definitions
 */
function parseFileForComponents(filePath: string, projectRoot: string, debug: boolean = false): ComponentMatch[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const components: ComponentMatch[] = [];
  const relativePath = relative(projectRoot, filePath);
  
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Pattern 1: Exported components with 'id' field (handle multi-line)
    // export const myComponent = componentType({id: 'component-id', ...})
    const exportedIdPattern = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*?id:\s*['"`]([^'"`]+)['"`]/gs;
    
    // Pattern 1b: Exported components with 'type' field (for statusComponents, handle multi-line)
    // export const myComponent = statusComponent({type: 'component-type', ...})
    const exportedTypePattern = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*?type:\s*['"`]([^'"`]+)['"`]/gs;
    
    // Pattern 1c: Exported components with 'name' field (for functionTools, handle multi-line)
    // export const myComponent = functionTool({name: 'component-name', ...})
    const exportedNamePattern = /export\s+const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*?name:\s*['"`]([^'"`]+)['"`]/gs;
    
    // Pattern 2: Separate declaration + export patterns
    // const myComponent = componentType({id: 'component-id', ...}) + export { myComponent, ... }
    // Handle multi-line patterns where id might be on next line
    const declaredIdPattern = /(?:^|\n)\s*const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*?id:\s*['"`]([^'"`]+)['"`]/gs;
    const declaredTypePattern = /(?:^|\n)\s*const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*?type:\s*['"`]([^'"`]+)['"`]/gs;
    const declaredNamePattern = /(?:^|\n)\s*const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*?name:\s*['"`]([^'"`]+)['"`]/gs;
    
    // Find all export statements like: export { varName1, varName2, ... }
    const exportedVariables = new Set<string>();
    const exportPattern = /export\s*\{\s*([^}]+)\s*\}/g;
    let exportMatch;
    while ((exportMatch = exportPattern.exec(content)) !== null) {
      const exportList = exportMatch[1];
      // Split by comma and clean up each variable name
      const variables = exportList.split(',').map(v => v.trim()).filter(v => v);
      variables.forEach(v => exportedVariables.add(v));
    }
    
    // Process 'id' pattern
    let match;
    while ((match = exportedIdPattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      if (componentType) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: false
        });
      }
    }
    
    // Process 'type' pattern (mainly for statusComponents)
    while ((match = exportedTypePattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      if (componentType) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: false
        });
      }
    }
    
    // Process 'name' pattern (only for functionTools)
    while ((match = exportedNamePattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      // Only use 'name' field for functionTool components
      if (componentType && componentType === 'functionTool') {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: false
        });
      }
    }
    
    // Process separate declaration patterns with 'id' field
    while ((match = declaredIdPattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      if (componentType && exportedVariables.has(variableName)) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: false // It's exported via separate export statement
        });
      }
    }
    
    // Process separate declaration patterns with 'type' field
    while ((match = declaredTypePattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      if (componentType && exportedVariables.has(variableName)) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: false // It's exported via separate export statement
        });
      }
    }
    
    // Process separate declaration patterns with 'name' field (only for functionTools)
    while ((match = declaredNamePattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      // Only use 'name' field for functionTool components
      if (componentType && componentType === 'functionTool' && exportedVariables.has(variableName)) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: false // It's exported via separate export statement
        });
      }
    }

    // Pattern 2b: Declared but not exported components (const name = componentType({id: '...'}))
    // These have variable names but are not exported - they're used inline within other components
    while ((match = declaredIdPattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      if (componentType && !exportedVariables.has(variableName)) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: true // Not exported, so treated as inline but has variable name
        });
      }
    }
    
    while ((match = declaredTypePattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      if (componentType && !exportedVariables.has(variableName)) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: true // Not exported, so treated as inline but has variable name
        });
      }
    }
    
    while ((match = declaredNamePattern.exec(content)) !== null) {
      const variableName = match[1];
      const functionName = match[2];
      const componentId = match[3];
      
      const componentType = COMPONENT_TYPE_MAP[functionName];
      // Only use 'name' field for functionTool components
      if (componentType && componentType === 'functionTool' && !exportedVariables.has(variableName)) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName,
          startLine: lineNumber,
          isInline: true // Not exported, so treated as inline but has variable name
        });
      }
    }

    // Pattern 3: Truly inline components (not declared, not exported)
    // componentType({id: 'component-id', ...}) anywhere in code without variable declaration
    const componentTypes = Object.keys(COMPONENT_TYPE_MAP);
    for (const funcName of componentTypes) {
      // Look for function calls that are NOT part of variable declarations (export const or const)
      // Handle multi-line patterns where id might be on next line
      const inlineIdPattern = new RegExp(`(?<!(?:export\\s+)?const\\s+\\w+\\s*=\\s*)\\b${funcName}\\s*\\(\\s*\\{[^}]*?id:\\s*['"\`]([^'"\`]+)['"\`]`, 'gs');
      
      let inlineMatch;
      while ((inlineMatch = inlineIdPattern.exec(content)) !== null) {
        const componentId = inlineMatch[1];
        const componentType = COMPONENT_TYPE_MAP[funcName];
        const lineNumber = content.substring(0, inlineMatch.index).split('\n').length;
        
        components.push({
          id: componentId,
          type: componentType,
          filePath: relativePath,
          variableName: undefined, // No variable name for inline
          startLine: lineNumber,
          isInline: true
        });
      }
      
      // Also look for 'name' field for function tools only (handle multi-line)
      if (funcName === 'functionTool') {
        const inlineNamePattern = new RegExp(`(?<!(?:export\\s+)?const\\s+\\w+\\s*=\\s*)\\b${funcName}\\s*\\(\\s*\\{[^}]*?name:\\s*['"\`]([^'"\`]+)['"\`]`, 'gs');
        
        while ((inlineMatch = inlineNamePattern.exec(content)) !== null) {
          const componentId = inlineMatch[1];
          const componentType = COMPONENT_TYPE_MAP[funcName];
          const lineNumber = content.substring(0, inlineMatch.index).split('\n').length;
          
          components.push({
            id: componentId,
            type: componentType,
            filePath: relativePath,
            variableName: undefined, // No variable name for inline
            startLine: lineNumber,
            isInline: true
          });
        }
      }
    }


  } catch (error) {
    console.warn(`Failed to parse file ${filePath}: ${error}`);
  }

  return components;
}

/**
 * Recursively scan project for all TypeScript files
 */
function scanProjectForComponents(projectRoot: string, debug: boolean = false): ComponentMatch[] {
  const allComponents: ComponentMatch[] = [];
  
  function scanDirectory(dirPath: string) {
    if (!existsSync(dirPath)) return;
    
    
    try {
      const entries = readdirSync(dirPath);
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);
        
        if (stat.isFile() && extname(entry) === '.ts') {
          const fileComponents = parseFileForComponents(fullPath, projectRoot, debug);
          allComponents.push(...fileComponents);
        } else if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          scanDirectory(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${dirPath}: ${error}`);
    }
  }
  
  scanDirectory(projectRoot);
  return allComponents;
}

/**
 * Generate a variable name for inline components
 */
function generateVariableName(componentId: string, componentType: ComponentType): string {
  // Convert kebab-case or snake_case to camelCase
  const camelCase = componentId
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
  
  return camelCase || `${componentType}Component`;
}

/**
 * Build component registry from project parsing
 */
export function buildComponentRegistryFromParsing(
  projectRoot: string,
  debug: boolean = false
): ComponentRegistry {
  const registry = new ComponentRegistry();
  

  const allComponents = scanProjectForComponents(projectRoot, debug);
  
  // Sort components to prioritize exported over inline (in case of duplicates)
  allComponents.sort((a, b) => {
    if (a.id === b.id) {
      // Same ID: prioritize exported (false) over inline (true)
      return Number(a.isInline) - Number(b.isInline);
    }
    return 0; // Keep original order for different IDs
  });
  
  // Register components with registry (avoid duplicates by ID)
  const stats = {
    exported: 0,
    inline: 0,
    byType: {} as Record<string, number>
  };
  
  const registeredTypeIds = new Set<string>(); // Use type:id instead of just id
  
  for (const component of allComponents) {
    const typeId = `${component.type}:${component.id}`;
    
    // Skip if already registered (prevents duplicates from multiple pattern matches)
    if (registeredTypeIds.has(typeId)) {
      continue;
    }
    
    
    registeredTypeIds.add(typeId);
    
    if (component.variableName) {
      // Component has an actual variable name (declared with const/export const), use it
      
      
      registry.register(
        component.id,
        component.type,
        component.filePath,
        component.variableName,
        component.isInline
      );
    } else {
      // Truly inline component with no variable name, generate one
      const generatedName = generateVariableName(component.id, component.type);
      registry.register(
        component.id,
        component.type,
        component.filePath,
        generatedName,
        true // isInline = true
      );
    }
    
    // Update stats
    if (component.isInline) {
      stats.inline++;
    } else {
      stats.exported++;
    }
    stats.byType[component.type] = (stats.byType[component.type] || 0) + 1;
    
  }

  const total = stats.exported + stats.inline;
  

  return registry;
}

/**
 * Get component location info for a specific component ID
 */
export function findComponentById(
  componentId: string,
  projectRoot: string
): ComponentMatch | null {
  const allComponents = scanProjectForComponents(projectRoot, false);
  return allComponents.find(comp => comp.id === componentId) || null;
}

/**
 * Get all local component IDs
 */
export function getAllLocalComponentIds(projectRoot: string): Set<string> {
  const allComponents = scanProjectForComponents(projectRoot, false);
  return new Set(allComponents.map(comp => comp.id));
}