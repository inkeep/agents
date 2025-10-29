/**
 * Component discovery - finds where components are currently defined in the codebase
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface ComponentLocation {
  componentType:
    | 'agent'
    | 'tool'
    | 'dataComponent'
    | 'artifactComponent'
    | 'statusComponent'
    | 'environment'
    | 'project';
  componentId: string;
  filePath: string;
  exportName: string;
  lineNumber?: number;
  isInline?: boolean; // true if this component is defined inline within another file (not exported)
}

/**
 * Recursively find all .ts files in a directory
 */
function findTsFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) {
    return results;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.substring(baseDir.length + 1);

    // Skip certain directories and files
    if (
      entry.name === 'node_modules' ||
      entry.name.startsWith('.') ||
      entry.name.endsWith('.d.ts') ||
      entry.name.endsWith('.test.ts') ||
      entry.name.endsWith('.spec.ts')
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...findTsFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(relativePath);
    }
  }

  return results;
}

/**
 * Search the entire project to find where components are defined
 */
export async function discoverComponentLocations(
  projectDir: string
): Promise<Map<string, ComponentLocation>> {
  const locations = new Map<string, ComponentLocation>();

  // Search all TypeScript files in the project
  const tsFiles = findTsFiles(projectDir);

  for (const relativeFilePath of tsFiles) {
    const filePath = join(projectDir, relativeFilePath);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const foundComponents = parseComponentsInFile(content, filePath);

      for (const component of foundComponents) {
        const key = `${component.componentType}:${component.componentId}`;
        locations.set(key, component);
      }
    }
  }

  return locations;
}

/**
 * Parse a TypeScript file to find component definitions
 */
function parseComponentsInFile(content: string, filePath: string): ComponentLocation[] {
  const components: ComponentLocation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for export patterns that define components
    const agentMatch = line.match(/export\s+const\s+(\w+)\s*=\s*agent\s*\(/);
    if (agentMatch) {
      const exportName = agentMatch[1];
      const id = extractIdFromDefinition(content, i);
      if (id) {
        components.push({
          componentType: 'agent',
          componentId: id,
          filePath,
          exportName,
          lineNumber: i + 1,
        });
      }
    }

    const subAgentMatch = line.match(/export\s+const\s+(\w+)\s*=\s*subAgent\s*\(/);
    if (subAgentMatch) {
      const exportName = subAgentMatch[1];
      const id = extractIdFromDefinition(content, i);
      if (id) {
        components.push({
          componentType: 'agent', // subAgents are treated as agents
          componentId: id,
          filePath,
          exportName,
          lineNumber: i + 1,
        });
      }
    }

    const toolMatch = line.match(/export\s+const\s+(\w+)\s*=\s*(mcpTool|functionTool)\s*\(/);
    if (toolMatch) {
      const exportName = toolMatch[1];
      const id = extractIdFromDefinition(content, i);
      if (id) {
        components.push({
          componentType: 'tool',
          componentId: id,
          filePath,
          exportName,
          lineNumber: i + 1,
        });
      }
    }

    const dataComponentMatch = line.match(/export\s+const\s+(\w+)\s*=\s*dataComponent\s*\(/);
    if (dataComponentMatch) {
      const exportName = dataComponentMatch[1];
      const id = extractIdFromDefinition(content, i);
      if (id) {
        components.push({
          componentType: 'dataComponent',
          componentId: id,
          filePath,
          exportName,
          lineNumber: i + 1,
        });
      }
    }

    const artifactComponentMatch = line.match(
      /export\s+const\s+(\w+)\s*=\s*artifactComponent\s*\(/
    );
    if (artifactComponentMatch) {
      const exportName = artifactComponentMatch[1];
      const id = extractIdFromDefinition(content, i);
      if (id) {
        components.push({
          componentType: 'artifactComponent',
          componentId: id,
          filePath,
          exportName,
          lineNumber: i + 1,
        });
      }
    }

    const statusComponentMatch = line.match(/export\s+const\s+(\w+)\s*=\s*statusComponent\s*\(/);
    if (statusComponentMatch) {
      const exportName = statusComponentMatch[1];
      const id = extractIdFromDefinition(content, i);
      if (id) {
        components.push({
          componentType: 'statusComponent',
          componentId: id,
          filePath,
          exportName,
          lineNumber: i + 1,
        });
      }
    }

    const environmentMatch = line.match(
      /export\s+const\s+(\w+)\s*=\s*registerEnvironmentSettings\s*\(/
    );
    if (environmentMatch) {
      const exportName = environmentMatch[1];
      // For environments, the ID is typically the export name or filename
      const id = exportName
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
      components.push({
        componentType: 'environment',
        componentId: id,
        filePath,
        exportName,
        lineNumber: i + 1,
      });
    }

    const projectMatch = line.match(/export\s+const\s+(\w+)\s*=\s*project\s*\(/);
    if (projectMatch) {
      const exportName = projectMatch[1];
      const id = extractIdFromDefinition(content, i);
      if (id) {
        components.push({
          componentType: 'project',
          componentId: id,
          filePath,
          exportName,
          lineNumber: i + 1,
        });
      }
    }
  }

  // Also look for INLINE (non-exported) components like inline functionTools
  // Pattern: const myComponent = functionTool({...})
  const inlinePattern = /(?:^|\n)\s*const\s+(\w+)\s*=\s*(functionTool|mcpTool|dataComponent|artifactComponent)\s*\(/g;
  const inlineMatches = content.matchAll(inlinePattern);
  
  for (const match of inlineMatches) {
    const exportName = match[1];
    const builderType = match[2];
    
    // Extract ID - for functionTools use 'name' field, for others use 'id'
    const componentStart = match.index || 0;
    const idField = builderType === 'functionTool' ? 'name' : 'id';
    const id = extractFieldFromDefinition(content, componentStart, idField);
    
    if (id) {
      // Determine component type
      let componentType: ComponentLocation['componentType'];
      if (builderType === 'functionTool' || builderType === 'mcpTool') {
        componentType = 'tool';
      } else if (builderType === 'dataComponent') {
        componentType = 'dataComponent';
      } else if (builderType === 'artifactComponent') {
        componentType = 'artifactComponent';
      } else {
        continue;
      }
      
      // Only add if not already added as an export
      const alreadyExists = components.some(c => c.componentId === id && c.componentType === componentType);
      if (!alreadyExists) {
        components.push({
          componentType,
          componentId: id,
          filePath,
          exportName,
          isInline: true,
        });
      }
    }
  }

  return components;
}

/**
 * Extract a field value (id or name) from a component definition
 */
function extractFieldFromDefinition(content: string, startPos: number, fieldName: string): string | null {
  // Look for the field in the next ~500 characters after component start
  const searchContent = content.substring(startPos, startPos + 500);
  
  // Match patterns like: name: 'value', or id: "value",
  const fieldPattern = new RegExp(`${fieldName}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
  const match = searchContent.match(fieldPattern);
  
  return match ? match[1] : null;
}

/**
 * Extract the ID from a component definition by looking for the id field
 */
function extractIdFromDefinition(content: string, startLine: number): string | null {
  const lines = content.split('\n');

  // Look for the id field in the next several lines after the component definition
  for (let i = startLine; i < Math.min(startLine + 20, lines.length); i++) {
    const line = lines[i];

    // Match patterns like: id: 'some-id', or id: "some-id",
    const idMatch = line.match(/id:\s*['"`]([^'"`]+)['"`]/);
    if (idMatch) {
      return idMatch[1];
    }

    // For status components, look for type field instead
    const typeMatch = line.match(/type:\s*['"`]([^'"`]+)['"`]/);
    if (typeMatch) {
      return typeMatch[1];
    }

    // Stop if we hit the closing brace of the component definition
    if (line.includes('});')) {
      break;
    }
  }

  return null;
}

/**
 * Find where a specific component is currently defined
 */
export async function findComponent(
  componentType: ComponentLocation['componentType'],
  componentId: string,
  projectDir: string
): Promise<ComponentLocation | null> {
  const allLocations = await discoverComponentLocations(projectDir);
  const key = `${componentType}:${componentId}`;
  return allLocations.get(key) || null;
}

/**
 * Get all files that contain components (to understand the organization pattern)
 */
export async function getComponentFilePattern(projectDir: string): Promise<{
  hasMainIndex: boolean;
  hasSeparateDirectories: boolean;
  hasMixedPattern: boolean;
  componentFiles: string[];
}> {
  const locations = await discoverComponentLocations(projectDir);
  const files = new Set<string>();

  let hasMainIndex = false;
  let hasSeparateDirectories = false;

  for (const location of locations.values()) {
    files.add(location.filePath);

    if (location.filePath.endsWith('index.ts') && !location.filePath.includes('/')) {
      hasMainIndex = true;
    } else if (location.filePath.includes('/')) {
      hasSeparateDirectories = true;
    }
  }

  const hasMixedPattern = hasMainIndex && hasSeparateDirectories;

  return {
    hasMainIndex,
    hasSeparateDirectories,
    hasMixedPattern,
    componentFiles: Array.from(files),
  };
}
