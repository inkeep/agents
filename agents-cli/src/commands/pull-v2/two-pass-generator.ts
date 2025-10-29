/**
 * Two-pass generation system:
 * 1. Generate new components deterministically in individual files
 * 2. Use LLM to integrate modified components into existing files with dependency context
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { generateAgentFile } from './agent-generator';
import { generateArtifactComponentFile } from './artifact-component-generator';
import {
  needsEnvironmentImport,
  resolveComponentDependencies,
} from './component-dependency-resolver';
import {
  type ComponentLocation,
  getImportStatement,
  mapAPIComponentsToLocalFiles,
} from './component-mapper';
import { generateDataComponentFile } from './data-component-generator';
import { generateEnvironmentFiles } from './environment-generator';
import { generateExternalAgentFile } from './external-agent-generator';
import { generateFunctionFile } from './function-generator';
import { type CodeStyle, DEFAULT_CODE_STYLE, ensureUniqueName, toVariableName } from './generator-utils';
import { generateComponentParts, integrateComponentsIntoFile } from './hybrid-generator';
import type { ComponentFieldChange } from './index';
import { generateStatusComponentFile, toStatusComponentVariableName } from './status-component-generator';
import { generateToolFile } from './tool-generator';

export interface TwoPassResult {
  newFiles: Map<string, string>; // relative path -> content
  modifiedFiles: Map<string, string>; // relative path -> content
  dependencies: Map<string, ComponentLocation[]>; // component ID -> dependencies it can import
  componentNameMap: Map<string, { name: string; type: string; importPath?: string }>; // for temp validation
}

/**
 * Generate files using two-pass approach:
 * 1. New components -> deterministic generation in individual files
 * 2. Modified components -> LLM integration with existing files
 */
export async function generateWithTwoPassApproach(
  projectRoot: string,
  projectData: FullProjectDefinition,
  addedComponents: { [componentType: string]: any[] },
  modifiedComponents: { [componentType: string]: ComponentFieldChange[] },
  style: CodeStyle = DEFAULT_CODE_STYLE
): Promise<TwoPassResult> {
  console.log(chalk.cyan(`🔄 Starting two-pass generation...`));

  // Get new component IDs
  const newComponentIds = new Set<string>();
  for (const [componentType, components] of Object.entries(addedComponents)) {
    for (const component of components) {
      newComponentIds.add(component.componentId || component.id);
    }
  }

  // Step 1: Map existing API components to local files
  const componentLocations = await mapAPIComponentsToLocalFiles(projectRoot, projectData);

  // Step 2: Resolve component dependencies
  const dependencyInfo = resolveComponentDependencies(projectData, newComponentIds);

  // Step 3: Build preliminary componentNameMap for deterministic naming
  // This needs to happen BEFORE file generation so files can use consistent names
  const preliminaryComponentNameMap = buildPreliminaryComponentNameMap(projectData);

  // Step 3.5: Generate new components deterministically
  const newFiles = await generateNewComponentFiles(
    projectData,
    addedComponents,
    dependencyInfo,
    componentLocations,
    style,
    preliminaryComponentNameMap
  );

  // Step 4: Generate modified components using LLM integration
  console.log(chalk.cyan(`🔧 Starting LLM integration for modified components...`));
  const modifiedComponentCount = Object.values(modifiedComponents).flat().length;
  if (modifiedComponentCount > 0) {
    console.log(chalk.gray(`   Processing ${modifiedComponentCount} modified component(s)`));
  }
  
  const modifiedFiles = await generateModifiedComponentFiles(
    projectRoot,
    projectData,
    modifiedComponents,
    dependencyInfo,
    componentLocations,
    newFiles, // Context about newly created files
    style
  );
  
  console.log(chalk.green(`✅ LLM integration complete - ${modifiedFiles.size} file(s) updated`));

  // Build the comprehensive componentNameMap for return
  const comprehensiveComponentNameMap = buildComprehensiveComponentNameMap(
    projectData,
    componentLocations,
    newFiles,
    'index.ts' // For temp validation, assume we're generating index.ts
  );

  return {
    newFiles,
    modifiedFiles,
    dependencies: new Map(), // TODO: Populate if needed
    componentNameMap: comprehensiveComponentNameMap,
  };
}

/**
 * Build preliminary componentNameMap from project data for deterministic naming
 * This maps component IDs to their variable names before file generation
 */
function buildPreliminaryComponentNameMap(
  projectData: FullProjectDefinition
): Map<string, { name: string; type: string }> {
  const nameMap = new Map<string, { name: string; type: string }>();
  const globalNameRegistry = new Set<string>();

  // Helper to register a component with unique name
  const registerComponent = (id: string, type: string, baseName: string) => {
    const uniqueName = ensureUniqueName(baseName, type as any, globalNameRegistry);
    globalNameRegistry.add(uniqueName);
    nameMap.set(`${type}:${id}`, { name: uniqueName, type });
    return uniqueName;
  };

  // Register tools
  if (projectData.tools) {
    for (const toolId of Object.keys(projectData.tools)) {
      const baseName = toVariableName(toolId);
      registerComponent(toolId, 'tool', baseName);
    }
  }

  // Register function tools
  if (projectData.functionTools) {
    for (const functionToolId of Object.keys(projectData.functionTools)) {
      const baseName = toVariableName(functionToolId);
      registerComponent(functionToolId, 'tool', baseName);
    }
  }

  // Register data components
  if (projectData.dataComponents) {
    for (const componentId of Object.keys(projectData.dataComponents)) {
      const baseName = toVariableName(componentId);
      registerComponent(componentId, 'dataComponent', baseName);
    }
  }

  // Register artifact components
  if (projectData.artifactComponents) {
    for (const componentId of Object.keys(projectData.artifactComponents)) {
      const baseName = toVariableName(componentId);
      registerComponent(componentId, 'artifactComponent', baseName);
    }
  }

  // Register status components from agents
  if (projectData.agents) {
    for (const agent of Object.values(projectData.agents)) {
      if ((agent as any).statusUpdates?.statusComponents) {
        for (const statusComp of (agent as any).statusUpdates.statusComponents) {
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId) {
            // Use toStatusComponentVariableName for consistent naming with generators
            const baseName = toStatusComponentVariableName(statusCompId);
            registerComponent(statusCompId, 'statusComponent', baseName);
          }
        }
      }
    }
  }

  // Register agents
  if (projectData.agents) {
    for (const agentId of Object.keys(projectData.agents)) {
      const baseName = toVariableName(agentId);
      registerComponent(agentId, 'agent', baseName);
    }
  }

  // Register external agents
  if (projectData.externalAgents) {
    for (const agentId of Object.keys(projectData.externalAgents)) {
      const baseName = toVariableName(agentId);
      registerComponent(agentId, 'agent', baseName);
    }
  }

  return nameMap;
}

/**
 * Generate new components in individual files using deterministic generation
 */
async function generateNewComponentFiles(
  projectData: FullProjectDefinition,
  addedComponents: { [componentType: string]: any[] },
  dependencyInfo: { dependencies: Map<string, any[]>; allReferencedComponents: Set<string> },
  componentLocations: Map<string, ComponentLocation>,
  style: CodeStyle,
  componentNameMap: Map<string, { name: string; type: string }>
): Promise<Map<string, string>> {
  const newFiles = new Map<string, string>();

  // Generate agents
  if (addedComponents.agents) {
    for (const agentData of addedComponents.agents) {
      const agentId = agentData.componentId || agentData.id;

      if (!agentId || typeof agentId !== 'string') {
        console.error(chalk.red(`❌ Invalid agentId for agent:`, agentId));
        continue;
      }

      const fileName = `agents/${agentId}.ts`;

      // Handle new components that don't exist locally (data is null)
      let actualAgentData = agentData.data;
      if (!actualAgentData || actualAgentData === null) {
        // Create a minimal agent structure for new components
        console.log(
          chalk.yellow(
            `⚠️ Creating new agent '${agentId}' with minimal structure (not found in project data)`
          )
        );
        actualAgentData = {
          id: agentId,
          name: agentId.replace(/[-_]/g, ' '),
          description: `Generated agent for ${agentId}`,
          // Add minimal agent structure
          subAgents: {},
        };
      }

      try {
        // generateAgentFile handles its own import resolution using the project data
        const content = generateAgentFile(agentId, actualAgentData, projectData, style);
        newFiles.set(fileName, content);
      } catch (error: any) {
        console.error(
          chalk.red(`❌ Failed to generate agent file for '${agentId}':`, error.message)
        );
        throw error;
      }
    }
  }

  // Generate tools
  if (addedComponents.tools) {
    for (const toolData of addedComponents.tools) {
      const toolId = toolData.componentId || toolData.id;

      if (!toolId || typeof toolId !== 'string') {
        console.error(chalk.red(`❌ Invalid toolId for tool:`, toolId));
        continue;
      }

      const fileName = `tools/${toolId}.ts`;

      // Handle new components that don't exist locally (data is null)
      let actualToolData = toolData.data;
      if (!actualToolData || actualToolData === null) {
        // Create a minimal tool structure for new components
        console.log(
          chalk.yellow(
            `⚠️ Creating new tool '${toolId}' with minimal structure (not found in project data)`
          )
        );
        actualToolData = {
          id: toolId,
          name: toolId.replace(/[-_]/g, ' '),
          description: `Generated tool for ${toolId}`,
          // Add minimal tool structure - this will need to be refined based on the actual tool type
          type: 'mcp',
          transport: {
            type: 'stdio',
          },
        };
      }

      // Get dependencies for this tool
      const toolDeps = dependencyInfo.dependencies.get(toolId) || [];
      const imports = generateImportsForComponent(fileName, toolDeps, componentLocations, style);

      // Add environment import if needed
      const needsEnv = needsEnvironmentImport(actualToolData);
      if (needsEnv) {
        const q = style.quotes === 'single' ? "'" : '"';
        const semi = style.semicolons ? ';' : '';
        imports.unshift(`import { envSettings } from ${q}../environments${q}${semi}`);
      }

      // Check if this is a function tool (has implementation field) or a regular tool
      const isFunctionTool = actualToolData.implementation || actualToolData.executeCode;
      const content = isFunctionTool 
        ? generateFunctionFile(toolId, actualToolData, style, imports)
        : generateToolFile(toolId, actualToolData, style);
      newFiles.set(fileName, content);
    }
  }

  // Generate data components
  if (addedComponents.dataComponents) {
    for (const componentData of addedComponents.dataComponents) {
      const componentId = componentData.componentId || componentData.id;
      const fileName = `data-components/${componentId}.ts`;

      // Data components typically don't have dependencies, but check anyway
      const componentDeps = dependencyInfo.dependencies.get(componentId) || [];
      const imports = generateImportsForComponent(
        fileName,
        componentDeps,
        componentLocations,
        style
      );

      const content = generateDataComponentFile(componentId, componentData.data, style);
      newFiles.set(fileName, content);
    }
  }

  // Generate artifact components
  if (addedComponents.artifactComponents) {
    for (const componentData of addedComponents.artifactComponents) {
      const componentId = componentData.componentId || componentData.id;

      if (!componentId || typeof componentId !== 'string') {
        console.error(chalk.red(`❌ Invalid componentId for artifact component:`, componentId));
        continue;
      }

      const fileName = `artifact-components/${componentId}.ts`;

      // Handle new components that don't exist locally (data is null)
      let actualComponentData = componentData.data;
      if (!actualComponentData || actualComponentData === null) {
        // Create a minimal artifact component structure for new components
        actualComponentData = {
          id: componentId,
          name: componentId.replace(/[-_]/g, ' '),
          description: `Generated artifact component for ${componentId}`,
          // Add minimal artifact component structure
          output: `Generated output for ${componentId}`,
        };
      }

      try {
        // Artifact components typically don't have dependencies, but check anyway
        const componentDeps = dependencyInfo.dependencies.get(componentId) || [];
        const imports = generateImportsForComponent(
          fileName,
          componentDeps,
          componentLocations,
          style
        );

        const content = generateArtifactComponentFile(componentId, actualComponentData, style);
        newFiles.set(fileName, content);
      } catch (error: any) {
        console.error(
          chalk.red(
            `❌ Failed to generate artifact component file for '${componentId}':`,
            error.message
          )
        );
        throw error;
      }
    }
  }

  // Generate status components (if they exist as separate components)
  console.log(chalk.gray(`🔍 Generating status components...`));
  console.log(chalk.gray(`  addedComponents.statusComponents exists: ${!!addedComponents.statusComponents}`));
  if (addedComponents.statusComponents) {
    console.log(chalk.gray(`  Number of status components: ${addedComponents.statusComponents.length}`));
    for (const componentData of addedComponents.statusComponents) {
      const componentId = componentData.componentId || componentData.id;
      const fileName = `status-components/${componentId}.ts`;
      console.log(chalk.gray(`  Generating status component: ${componentId} -> ${fileName}`));
      console.log(chalk.gray(`    componentData.data exists: ${!!componentData.data}`));

      try {
        const content = generateStatusComponentFile(componentId, componentData.data, style, componentNameMap);
        newFiles.set(fileName, content);
        console.log(chalk.gray(`    ✅ Generated ${fileName}`));
      } catch (error: any) {
        console.error(chalk.red(`    ❌ Failed to generate ${fileName}: ${error.message}`));
        throw error;
      }
    }
  }

  // Generate environment files (special case - generates multiple files)
  if (addedComponents.environments || projectData.credentialReferences) {
    // Extract ALL credential references from tools, agents, and explicit credentials
    const { extractAllCredentialReferences } = await import('./environment-generator');
    const allCredentials = extractAllCredentialReferences(projectData);
    
    const environmentFiles = generateEnvironmentFiles(
      'development', // TODO: Make configurable
      allCredentials,
      style
    );

    // Add each environment file
    for (const [filename, content] of Object.entries(environmentFiles)) {
      const fullPath = `environments/${filename}`;
      newFiles.set(fullPath, content);
    }
  }

  // Generate functions
  if (addedComponents.functions) {
    for (const functionData of addedComponents.functions) {
      const functionId = functionData.componentId || functionData.id;
      const fileName = `functions/${functionId}.ts`;

      // Get dependencies for this function
      const functionDeps = dependencyInfo.dependencies.get(functionId) || [];
      const imports = generateImportsForComponent(
        fileName,
        functionDeps,
        componentLocations,
        style
      );

      // Add environment import if needed
      const needsEnv = needsEnvironmentImport(functionData.data);
      if (needsEnv) {
        const q = style.quotes === 'single' ? "'" : '"';
        const semi = style.semicolons ? ';' : '';
        imports.unshift(`import { envSettings } from ${q}../environments${q}${semi}`);
      }

      const content = generateFunctionFile(functionId, functionData.data, style, imports);
      newFiles.set(fileName, content);
    }
  }

  // Generate external agents
  console.log(chalk.gray(`🔍 Generating external agents...`));
  console.log(chalk.gray(`  addedComponents.externalAgents exists: ${!!addedComponents.externalAgents}`));
  if (addedComponents.externalAgents) {
    console.log(chalk.gray(`  Number of external agents: ${addedComponents.externalAgents.length}`));
    for (const agentData of addedComponents.externalAgents) {
      const agentId = agentData.componentId || agentData.id;
      const fileName = `agents/${agentId}.ts`;  // Put in agents/ directory, not external-agents/
      console.log(chalk.gray(`  Generating external agent: ${agentId} -> ${fileName}`));

      try {
        // Get dependencies for this external agent
        const agentDeps = dependencyInfo.dependencies.get(agentId) || [];
        const imports = generateImportsForComponent(fileName, agentDeps, componentLocations, style);

        // Add environment import if needed (for authentication, headers, etc.)
        const needsEnv = needsEnvironmentImport(agentData.data);
        if (needsEnv) {
          const q = style.quotes === 'single' ? "'" : '"';
          const semi = style.semicolons ? ';' : '';
          imports.unshift(`import { envSettings } from ${q}../environments${q}${semi}`);
        }

        const content = generateExternalAgentFile(agentData.data, imports, style);
        newFiles.set(fileName, content);
        console.log(chalk.gray(`    ✅ Generated ${fileName}`));
      } catch (error: any) {
        console.error(chalk.red(`    ❌ Failed to generate ${fileName}: ${error.message}`));
        throw error;
      }
    }
  }

  return newFiles;
}

/**
 * Generate modified components using LLM integration with existing files
 */
async function generateModifiedComponentFiles(
  projectRoot: string,
  projectData: FullProjectDefinition,
  modifiedComponents: { [componentType: string]: ComponentFieldChange[] },
  dependencyInfo: { dependencies: Map<string, any[]>; allReferencedComponents: Set<string> },
  componentLocations: Map<string, ComponentLocation>,
  newFiles: Map<string, string>, // Context about newly created files
  style: CodeStyle
): Promise<Map<string, string>> {
  const modifiedFiles = new Map<string, string>();

  // Group modified components by their current file location
  const componentsByFile = new Map<string, ComponentFieldChange[]>();

  for (const [componentType, components] of Object.entries(modifiedComponents)) {
    for (const component of components) {
      // Find where this component currently lives
      const location = componentLocations.get(component.componentId);
      if (location) {
        const existingComponents = componentsByFile.get(location.filePath) || [];
        existingComponents.push(component);
        componentsByFile.set(location.filePath, existingComponents);
      } else {
        console.warn(
          chalk.yellow(`  ⚠️  Modified component ${component.componentId} not found in local files`)
        );
      }
    }
  }

  // Generate each file with its modified components
  let fileIndex = 0;
  for (const [filePath, componentsInFile] of componentsByFile) {
    fileIndex++;
    console.log(chalk.gray(`   [${fileIndex}/${componentsByFile.size}] Processing ${filePath}...`));
    console.log(chalk.gray(`      Components in file: ${componentsInFile.map(c => c.componentId).join(', ')}`));
    
    // Create dependency context for this file
    const dependencyContext = createDependencyContextForFile(
      filePath,
      componentsInFile,
      dependencyInfo,
      componentLocations,
      newFiles,
      style
    );

    // Use hybrid LLM integration for modified components
    try {
      const fullFilePath = join(projectRoot, filePath);
      const existingContent = existsSync(fullFilePath) ? readFileSync(fullFilePath, 'utf-8') : '';
      
      console.log(chalk.gray(`      Calling LLM to integrate changes...`));

      // Build comprehensive componentNameMap for this file
      const comprehensiveComponentNameMap = buildComprehensiveComponentNameMap(
        projectData,
        componentLocations,
        newFiles,
        filePath
      );
      
      // Debug: log what's in the comprehensive map
      console.log(chalk.gray(`      Comprehensive map has ${comprehensiveComponentNameMap.size} entries`));
      const toolEntries = Array.from(comprehensiveComponentNameMap.entries()).filter(([key]) => key.startsWith('tool:'));
      console.log(chalk.gray(`      Tool entries in map: ${toolEntries.map(([key, val]) => `${key} (importPath: ${val.importPath})`).join(', ')}`));

      // Convert ComponentFieldChange to ComponentParts for the hybrid integration
      const componentsToModify = componentsInFile.map((comp) => {
        const location = componentLocations.get(comp.componentId);
        const parts = generateComponentParts(
          comp.componentType as any,
          comp.componentId,
          comp.data,
          style,
          projectData, // Pass project data
          comprehensiveComponentNameMap, // Pass comprehensive component mapping
          true, // usePlaceholders
          location?.isInline // Pass isInline flag
        );
        
        // Debug: log what imports were generated
        if (comp.componentType === 'agent') {
          console.log(chalk.gray(`      Generated ${parts.imports.length} imports for agent ${comp.componentId}:`));
          parts.imports.forEach(imp => console.log(chalk.gray(`        - ${imp}`)));
        }
        
        return parts;
      });

      const startTime = Date.now();
      const result = await integrateComponentsIntoFile({
        filePath: fullFilePath, // Use full absolute path instead of relative path
        existingContent,
        componentsToAdd: [], // generateComponentParts should have all imports already
        componentsToModify,
        debug: true,
      });
      const duration = Date.now() - startTime;

        if (result.success && result.updatedContent) {
          console.log(chalk.green(`      ✓ LLM integration complete (${duration}ms)`));
          // The hybrid integration already handles placeholder restoration
          // No special handling needed for inline components - placeholders are restored for all components
          modifiedFiles.set(filePath, result.updatedContent);
        } else {
          console.error(chalk.red(`      ✗ Hybrid integration failed for ${filePath}: ${result.error}`));
        }
      } catch (error: any) {
        console.error(chalk.red(`      ✗ Failed to modify ${filePath}: ${error.message || error}`));
        if (error.stack) {
          console.error(chalk.gray(`      Stack: ${error.stack.split('\n').slice(0, 3).join('\n      ')}`));
        }
        // Continue with other files
      }
    }

  return modifiedFiles;
}

/**
 * Generate import statements for a component based on its dependencies
 */
function generateImportsForComponent(
  componentFilePath: string,
  dependencies: any[],
  componentLocations: Map<string, ComponentLocation>,
  style: CodeStyle
): string[] {
  const imports: string[] = [];

  for (const dep of dependencies) {
    const location = componentLocations.get(dep.componentId);
    if (location) {
      const importStatement = getImportStatement(
        componentFilePath,
        location,
        style.quotes === 'single' ? 'single' : 'double',
        style.semicolons
      );
      imports.push(importStatement);
    }
  }

  return imports;
}

/**
 * Create dependency context for LLM integration
 */
function createDependencyContextForFile(
  filePath: string,
  componentsInFile: ComponentFieldChange[],
  dependencyInfo: { dependencies: Map<string, any[]>; allReferencedComponents: Set<string> },
  componentLocations: Map<string, ComponentLocation>,
  newFiles: Map<string, string>,
  style: CodeStyle
): any {
  // Create context about:
  // 1. What new components were created (so they can be imported)
  // 2. What dependencies the modified components need
  // 3. Import statements for any new dependencies

  const context = {
    newlyCreatedComponents: [],
    availableImports: [],
    modifiedComponents: componentsInFile,
  };

  // Add info about newly created files that could be imported
  for (const [newFilePath, content] of newFiles) {
    // Extract component info from new file
    const componentMatch = content.match(/export\s+const\s+(\w+)\s*=/);
    if (componentMatch) {
      const exportName = componentMatch[1];
      context.newlyCreatedComponents.push({
        filePath: newFilePath,
        exportName,
        importPath: calculateImportPath(filePath, newFilePath),
      });
    }
  }

  return context;
}

/**
 * Build comprehensive componentNameMap with all components (existing + new)
 * This includes variable names and import paths for proper code generation
 */
function buildComprehensiveComponentNameMap(
  projectData: FullProjectDefinition,
  componentLocations: Map<string, ComponentLocation>,
  newFiles: Map<string, string>,
  targetFilePath: string
): Map<string, { name: string; type: string; importPath?: string }> {
  const componentNameMap = new Map<string, { name: string; type: string; importPath?: string }>();

  // Add existing components from componentLocations
  for (const [componentId, location] of componentLocations) {
    const key = `${location.componentType}:${componentId}`;
    const importPath =
      location.filePath === targetFilePath
        ? undefined // Don't need import path for components in the same file
        : calculateImportPath(targetFilePath, location.filePath);

    componentNameMap.set(key, {
      name: location.exportName,
      type: location.componentType,
      importPath,
    });
  }

  // Add project entry (always exported from index.ts)
  const projectKey = `project:${projectData.id}`;
  let projectVarName = toVariableName(projectData.id);

  // Check if project name would collide with ANY component name from the API data
  const allComponentNames = new Set<string>();

  // Collect all potential component variable names
  if (projectData.agents) {
    Object.keys(projectData.agents).forEach((id) => allComponentNames.add(toVariableName(id)));
  }
  if (projectData.tools) {
    Object.keys(projectData.tools).forEach((id) => allComponentNames.add(toVariableName(id)));
  }
  if (projectData.dataComponents) {
    Object.keys(projectData.dataComponents).forEach((id) =>
      allComponentNames.add(toVariableName(id))
    );
  }
  if (projectData.artifactComponents) {
    Object.keys(projectData.artifactComponents).forEach((id) =>
      allComponentNames.add(toVariableName(id))
    );
  }
  if (projectData.functions) {
    Object.keys(projectData.functions).forEach((id) => allComponentNames.add(toVariableName(id)));
  }

  if (allComponentNames.has(projectVarName)) {
    // Add 'Project' suffix to avoid collision with any component names
    projectVarName = toVariableName(projectData.id + 'Project');
  }

  componentNameMap.set(projectKey, {
    name: projectVarName,
    type: 'project',
    importPath:
      targetFilePath === 'index.ts' ? undefined : calculateImportPath(targetFilePath, 'index.ts'),
  });

  // Add new components from generated files
  for (const [newFilePath, content] of newFiles) {
    // Extract component info from new file
    const componentMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*(\w+)\s*\(/g);
    for (const match of componentMatches) {
      const exportName = match[1];
      const componentType = getComponentTypeFromFunction(match[2]); // mcpTool -> tool, etc.

      if (componentType) {
        // Extract component ID from the file content - be specific to the component type
        let idMatch: RegExpMatchArray | null = null;

        if (componentType === 'agent') {
          // For agents, look for the ID in the main agent() export, not subAgents
          idMatch = content.match(
            /export\s+const\s+\w+\s*=\s*agent\s*\(\s*{\s*id:\s*['"`]([^'"`]+)['"`]/
          );
        } else if (componentType === 'tool') {
          // For tools, always use 'id:' field first (both mcpTool and functionTool have it in generated code)
          // Only fall back to 'name:' if id doesn't exist (shouldn't happen in generated code)
          idMatch = content.match(/id:\s*['"`]([^'"`]+)['"`]/) || content.match(/name:\s*['"`]([^'"`]+)['"`]/);
        } else {
          // For other components, use the first id: field
          idMatch = content.match(/id:\s*['"`]([^'"`]+)['"`]/);
        }

        if (idMatch) {
          const componentId = idMatch[1];
          const key = `${componentType}:${componentId}`;
          const importPath = calculateImportPath(targetFilePath, newFilePath);

          // Check for variable name collisions with existing components
          let finalExportName = exportName;
          const existingNames = Array.from(componentNameMap.values()).map((v) => v.name);

          if (existingNames.includes(exportName)) {
            // Generate unique name by adding component type suffix
            const typeSuffix = componentType.charAt(0).toUpperCase() + componentType.slice(1);
            finalExportName = exportName + typeSuffix;
          }

          componentNameMap.set(key, {
            name: finalExportName,
            type: componentType,
            importPath,
          });
        }
      }
    }
  }

  return componentNameMap;
}

/**
 * Get component type from function name (mcpTool -> tool, agent -> agent, etc.)
 */
function getComponentTypeFromFunction(functionName: string): string | null {
  const mapping: Record<string, string> = {
    mcpTool: 'tool',
    functionTool: 'tool',
    agent: 'agent',
    subAgent: 'agent',
    dataComponent: 'dataComponent',
    artifactComponent: 'artifactComponent',
    statusComponent: 'statusComponent',
    externalAgent: 'externalAgent',
    envSettings: 'environment',
  };
  return mapping[functionName] || null;
}

/**
 * Calculate import path from one file to another
 */
function calculateImportPath(fromPath: string, toPath: string): string {
  // Remove .ts extension from toPath
  const cleanToPath = toPath.replace(/\.ts$/, '');

  // Calculate relative path
  const fromParts = fromPath.split('/');
  const toParts = cleanToPath.split('/');

  // Remove filename from fromParts
  fromParts.pop();

  // Find common prefix
  let commonLength = 0;
  while (
    commonLength < fromParts.length &&
    commonLength < toParts.length &&
    fromParts[commonLength] === toParts[commonLength]
  ) {
    commonLength++;
  }

  // Calculate relative path
  const upLevels = fromParts.length - commonLength;
  const pathParts: string[] = [];

  for (let i = 0; i < upLevels; i++) {
    pathParts.push('..');
  }

  pathParts.push(...toParts.slice(commonLength));

  let result = pathParts.join('/');
  if (!result.startsWith('.')) {
    result = './' + result;
  }

  return result;
}
