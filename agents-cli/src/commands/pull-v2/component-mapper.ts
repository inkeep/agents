/**
 * Component mapper - finds where API components exist locally
 *
 * This system maps API components to their current local file locations.
 * Key principle: Only components that exist in the API data matter for imports.
 * Local files that don't exist in the API are ignored.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';

export interface ComponentLocation {
  componentId: string;
  componentType:
    | 'agent'
    | 'tool'
    | 'dataComponent'
    | 'artifactComponent'
    | 'externalAgent'
    | 'statusComponent';
  filePath: string; // relative to project root
  exportName: string;
  importPath: string; // what to use in import statements (relative path without extension)
  isInline?: boolean; // true if this component is defined inline within another file (not exported)
}

/**
 * Find local file locations for components that exist in the API data
 * Only components from the API data are included in the result
 */
export async function mapAPIComponentsToLocalFiles(
  projectRoot: string,
  projectData: FullProjectDefinition
): Promise<Map<string, ComponentLocation>> {
  console.log(chalk.gray(`🗺️  Mapping API components to local files...`));

  const componentMap = new Map<string, ComponentLocation>();

  // Get all component IDs from API data
  const apiComponentIds = new Set<string>();

  if (projectData.agents) {
    for (const agentId of Object.keys(projectData.agents)) {
      apiComponentIds.add(agentId);
    }
  }

  if (projectData.tools) {
    for (const toolId of Object.keys(projectData.tools)) {
      apiComponentIds.add(toolId);
    }
  }

  if (projectData.functions) {
    for (const functionId of Object.keys(projectData.functions)) {
      apiComponentIds.add(functionId);
    }
  }

  // Add functionTools from project-level
  if (projectData.functionTools) {
    for (const functionToolId of Object.keys(projectData.functionTools)) {
      apiComponentIds.add(functionToolId);
    }
  }

  // Add functionTools from agent-level
  if (projectData.agents) {
    for (const agentData of Object.values(projectData.agents)) {
      if (agentData.functionTools) {
        for (const functionToolId of Object.keys(agentData.functionTools)) {
          apiComponentIds.add(functionToolId);
        }
      }
    }
  }

  if (projectData.dataComponents) {
    for (const componentId of Object.keys(projectData.dataComponents)) {
      apiComponentIds.add(componentId);
    }
  }

  if (projectData.artifactComponents) {
    for (const componentId of Object.keys(projectData.artifactComponents)) {
      apiComponentIds.add(componentId);
    }
  }

  if (projectData.externalAgents) {
    for (const agentId of Object.keys(projectData.externalAgents)) {
      apiComponentIds.add(agentId);
    }
  }

  console.log(chalk.gray(`  📋 Looking for ${apiComponentIds.size} API components in local files`));

  try {
    // Find all TypeScript files in the project using recursive directory traversal
    const allTsFiles = findTypeScriptFiles(projectRoot);

    // Scan each file for component exports
    for (const relativePath of allTsFiles) {
      const filePath = join(projectRoot, relativePath);
      const components = await scanFileForComponents(filePath, relativePath);

      // Only include components that exist in the API data
      for (const component of components) {
        if (apiComponentIds.has(component.componentId)) {
          componentMap.set(component.componentId, component);
        }
      }
    }

    console.log(chalk.gray(`  ✅ Found ${componentMap.size} API components in local files`));

    // Log which API components weren't found locally
    const notFoundLocally = Array.from(apiComponentIds).filter((id) => !componentMap.has(id));
    if (notFoundLocally.length > 0) {
      console.log(
        chalk.yellow(`  ⚠️  API components not found locally: ${notFoundLocally.join(', ')}`)
      );
    }
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Error scanning local files: ${error}`));
  }

  return componentMap;
}

/**
 * Scan a single file for component exports
 */
async function scanFileForComponents(
  filePath: string,
  relativePath: string
): Promise<ComponentLocation[]> {
  const components: ComponentLocation[] = [];

  try {
    const content = readFileSync(filePath, 'utf-8');

    // Generate import path (remove .ts extension and add ./ if needed)
    const importPath = relativePath.startsWith('./')
      ? relativePath.replace(/\.ts$/, '')
      : `./${relativePath.replace(/\.ts$/, '')}`;

    // Look for agent exports
    const agentMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*agent\s*\(/g);
    for (const match of agentMatches) {
      const exportName = match[1];
      const agentId = extractComponentId(content, match.index || 0, 'id') || exportName;

      components.push({
        componentId: agentId,
        componentType: 'agent',
        filePath: relativePath,
        exportName,
        importPath,
      });
    }

    // Look for tool exports (both mcpTool and tool patterns)
    const toolMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:mcpTool|tool)\s*\(/g);
    for (const match of toolMatches) {
      const exportName = match[1];
      const toolId = extractComponentId(content, match.index || 0, 'id') || exportName;

      components.push({
        componentId: toolId,
        componentType: 'tool',
        filePath: relativePath,
        exportName,
        importPath,
      });
    }

    // Look for functionTool exports (separate files)
    const functionToolMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*functionTool\s*\(/g);
    for (const match of functionToolMatches) {
      const exportName = match[1];
      // For functionTools, the ID is derived from the name field, not an id field
      const functionToolId = extractComponentId(content, match.index || 0, 'name') || exportName;

      components.push({
        componentId: functionToolId,
        componentType: 'tool', // functionTools are tools, just like mcpTools
        filePath: relativePath,
        exportName,
        importPath,
      });
    }

    // Look for inline component declarations (not exported)
    // ANY component could be defined inline: tools, dataComponents, artifactComponents, etc.
    // Pattern: const myComponent = componentType({...})
    const inlineComponentPattern = /(?:^|\n)\s*const\s+(\w+)\s*=\s*(mcpTool|functionTool|dataComponent|artifactComponent|statusComponent|externalAgent)\s*\(/g;
    const inlineComponentMatches = content.matchAll(inlineComponentPattern);
    
    for (const match of inlineComponentMatches) {
      const exportName = match[1];
      const builderFunction = match[2]; // e.g., 'mcpTool', 'functionTool', 'dataComponent', etc.
      
      // Map builder function to component type
      let componentType: ComponentLocation['componentType'];
      let idField: string;
      
      if (builderFunction === 'mcpTool' || builderFunction === 'functionTool') {
        componentType = 'tool';
        // functionTools use 'name', mcpTools use 'id'
        idField = builderFunction === 'functionTool' ? 'name' : 'id';
      } else if (builderFunction === 'dataComponent') {
        componentType = 'dataComponent';
        idField = 'id';
      } else if (builderFunction === 'artifactComponent') {
        componentType = 'artifactComponent';
        idField = 'id';
      } else if (builderFunction === 'statusComponent') {
        componentType = 'statusComponent';
        idField = 'type'; // statusComponents use 'type' field
      } else if (builderFunction === 'externalAgent') {
        componentType = 'externalAgent';
        idField = 'id';
      } else {
        continue; // Skip unknown types
      }
      
      const componentId = extractComponentId(content, match.index || 0, idField) || exportName;

      // Only add if not already added as an export (avoid duplicates)
      const alreadyExists = components.some(
        (c) => c.componentId === componentId && c.exportName === exportName
      );
      if (!alreadyExists) {
        components.push({
          componentId,
          componentType,
          filePath: relativePath,
          exportName, // Keep the const name for inline references
          importPath, // Same file, so this is the parent component's import path
          isInline: true, // Mark as inline so we don't try to import it
        });
      }
    }

    // Look for data component exports
    const dataMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*dataComponent\s*\(/g);
    for (const match of dataMatches) {
      const exportName = match[1];
      const componentId = extractComponentId(content, match.index || 0, 'id') || exportName;

      components.push({
        componentId,
        componentType: 'dataComponent',
        filePath: relativePath,
        exportName,
        importPath,
      });
    }

    // Look for artifact component exports
    const artifactMatches = content.matchAll(
      /export\s+const\s+(\w+)\s*=\s*artifactComponent\s*\(/g
    );
    for (const match of artifactMatches) {
      const exportName = match[1];
      const componentId = extractComponentId(content, match.index || 0, 'id') || exportName;

      components.push({
        componentId,
        componentType: 'artifactComponent',
        filePath: relativePath,
        exportName,
        importPath,
      });
    }

    // Look for external agent exports
    const externalAgentMatches = content.matchAll(
      /export\s+const\s+(\w+)\s*=\s*externalAgent\s*\(/g
    );
    for (const match of externalAgentMatches) {
      const exportName = match[1];
      const componentId = extractComponentId(content, match.index || 0, 'id') || exportName;

      components.push({
        componentId,
        componentType: 'externalAgent',
        filePath: relativePath,
        exportName,
        importPath,
      });
    }

    // Look for status component exports
    const statusMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*statusComponent\s*\(/g);
    for (const match of statusMatches) {
      const exportName = match[1];
      const componentId = extractComponentId(content, match.index || 0, 'id') || exportName;

      components.push({
        componentId,
        componentType: 'statusComponent',
        filePath: relativePath,
        exportName,
        importPath,
      });
    }
  } catch (error) {
    // Silently skip files that can't be read
  }

  return components;
}

/**
 * Extract component ID from component() call
 */
function extractComponentId(
  content: string,
  startIndex: number,
  idField: string = 'id'
): string | null {
  // Find the opening parenthesis
  let pos = startIndex;
  while (pos < content.length && content[pos] !== '(') {
    pos++;
  }
  if (pos >= content.length) return null;

  pos++; // Skip opening paren

  // Find the opening brace for the config object
  while (pos < content.length && /\s/.test(content[pos])) {
    pos++;
  }
  if (pos >= content.length || content[pos] !== '{') return null;

  // Look for the id field within a reasonable distance
  const searchEnd = Math.min(pos + 500, content.length);
  const idPattern = new RegExp(`${idField}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
  const idMatch = content.slice(pos, searchEnd).match(idPattern);

  return idMatch ? idMatch[1] : null;
}

/**
 * Get import statement for a component from another file
 */
export function getImportStatement(
  fromFilePath: string, // relative path of file that needs the import
  component: ComponentLocation,
  quotes: 'single' | 'double' = 'single',
  semicolons: boolean = true
): string {
  const q = quotes === 'single' ? "'" : '"';
  const semi = semicolons ? ';' : '';

  // Calculate relative import path
  const relativePath = calculateRelativeImportPath(fromFilePath, component.importPath);

  return `import { ${component.exportName} } from ${q}${relativePath}${q}${semi}`;
}

/**
 * Calculate relative import path between two files
 */
function calculateRelativeImportPath(fromPath: string, toPath: string): string {
  // Both paths should be relative paths like "agents/my-agent.ts" or "./tools/my-tool"

  // Remove leading ./ if present
  const cleanFromPath = fromPath.replace(/^\.\//, '');
  const cleanToPath = toPath.replace(/^\.\//, '');

  // Split into directory parts
  const fromParts = cleanFromPath.split('/');
  const toParts = cleanToPath.split('/');

  // Remove filename from fromParts (keep only directory)
  fromParts.pop();

  // Find common prefix
  let commonLength = 0;
  while (
    commonLength < fromParts.length &&
    commonLength < toParts.length - 1 && // -1 because toParts includes filename
    fromParts[commonLength] === toParts[commonLength]
  ) {
    commonLength++;
  }

  // Calculate how many directories to go up
  const upDirs = fromParts.length - commonLength;
  const relativeParts: string[] = [];

  // Add ../ for each directory to go up
  for (let i = 0; i < upDirs; i++) {
    relativeParts.push('..');
  }

  // Add remaining path from toParts
  relativeParts.push(...toParts.slice(commonLength));

  // Join and ensure it starts with ./ if it's a relative path
  let result = relativeParts.join('/');
  if (!result.startsWith('.')) {
    result = './' + result;
  }

  return result;
}

/**
 * Recursively find all TypeScript files in a directory
 */
function findTypeScriptFiles(rootDir: string, currentDir: string = ''): string[] {
  const files: string[] = [];
  const fullPath = join(rootDir, currentDir);

  try {
    const entries = readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);

      // Skip ignored directories and files
      if (shouldIgnorePath(entry.name, entry.isDirectory())) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        files.push(...findTypeScriptFiles(rootDir, entryPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(entryPath);
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }

  return files;
}

/**
 * Check if a path should be ignored
 */
function shouldIgnorePath(name: string, isDirectory: boolean): boolean {
  // Skip common directories to ignore
  const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
  if (isDirectory && ignoredDirs.includes(name)) {
    return true;
  }

  // CRITICAL: Skip temp validation directories to prevent recursive copying
  if (isDirectory && name.startsWith('temp-validation-')) {
    return true;
  }

  // Skip specific files
  if (name === 'index.ts' && !isDirectory) {
    return true;
  }

  // Skip hidden files and directories
  if (name.startsWith('.')) {
    return true;
  }

  return false;
}
