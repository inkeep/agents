/**
 * Pull v2 - Deterministic project code generation
 * 
 * This command pulls project data from the API and deterministically generates TypeScript files
 * without relying on LLMs, making it faster and more consistent than the original pull command.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ManagementApiClient } from '../../api';
import type { NestedInkeepConfig } from '../../config';
import { loadConfig } from '../../utils/config';
import { performBackgroundVersionCheck } from '../../utils/background-version-check';
import { compareProjects, type ProjectDiff } from './project-comparator';
import { generateToolFile } from './tool-generator';
import { generateDataComponentFile } from './data-component-generator';
import { generateArtifactComponentFile } from './artifact-component-generator';
import { generateStatusComponentFile } from './status-component-generator';
import { generateEnvironmentFiles } from './environment-generator';
import { generateAgentFile } from './agent-generator';
import { generateIndexFile } from './index-generator';
import { type CodeStyle, DEFAULT_CODE_STYLE, ensureUniqueName, type ComponentType } from './generator-utils';

export interface PullV2Options {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
  debug?: boolean;
  force?: boolean;
}

/**
 * Load and validate inkeep.config.ts
 */
async function loadProjectConfig(
  projectDir: string,
  configPathOverride?: string
): Promise<NestedInkeepConfig> {
  const configPath = configPathOverride
    ? resolve(process.cwd(), configPathOverride)
    : join(projectDir, 'inkeep.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const config = await loadConfig(configPath);

    if (!config.tenantId) {
      throw new Error('tenantId is required in inkeep.config.ts');
    }

    // Convert normalized config to nested format
    return {
      tenantId: config.tenantId,
      agentsManageApi: {
        url: config.agentsManageApiUrl || 'http://localhost:3002',
        ...(config.agentsManageApiKey && { apiKey: config.agentsManageApiKey }),
      },
      agentsRunApi: {
        url: config.agentsRunApiUrl || 'http://localhost:3003',
        ...(config.agentsRunApiKey && { apiKey: config.agentsRunApiKey }),
      },
      outputDirectory: config.outputDirectory,
    };
  } catch (error: any) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Ensure directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Create the project directory structure
 */
function createProjectStructure(
  projectDir: string,
  projectId: string,
  useCurrentDirectory: boolean = false
): {
  projectRoot: string;
  agentsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  statusComponentsDir: string;
  environmentsDir: string;
} {
  let projectRoot: string;
  if (useCurrentDirectory) {
    projectRoot = projectDir;
  } else {
    const dirName = projectDir.split('/').pop() || projectDir;
    projectRoot = dirName === projectId ? projectDir : join(projectDir, projectId);
  }

  const agentsDir = join(projectRoot, 'agents');
  const toolsDir = join(projectRoot, 'tools');
  const dataComponentsDir = join(projectRoot, 'data-components');
  const artifactComponentsDir = join(projectRoot, 'artifact-components');
  const statusComponentsDir = join(projectRoot, 'status-components');
  const environmentsDir = join(projectRoot, 'environments');

  ensureDirectoryExists(projectRoot);
  ensureDirectoryExists(agentsDir);
  ensureDirectoryExists(toolsDir);
  ensureDirectoryExists(dataComponentsDir);
  ensureDirectoryExists(artifactComponentsDir);
  ensureDirectoryExists(statusComponentsDir);
  ensureDirectoryExists(environmentsDir);

  return {
    projectRoot,
    agentsDir,
    toolsDir,
    dataComponentsDir,
    artifactComponentsDir,
    statusComponentsDir,
    environmentsDir,
  };
}

/**
 * Read existing project from filesystem if it exists
 */
async function readExistingProject(projectRoot: string): Promise<FullProjectDefinition | null> {
  const indexPath = join(projectRoot, 'index.ts');
  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    // For now, just return null - we don't have a way to reverse-engineer the FullProjectDefinition
    // from the generated files. In the future, we could parse the files or maintain a .project.json
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate files based on project diff
 */
async function generateFiles(
  project: FullProjectDefinition,
  diff: ProjectDiff,
  paths: ReturnType<typeof createProjectStructure>,
  targetEnv: string,
  style: CodeStyle,
  debug: boolean
): Promise<void> {
  const { projectRoot, agentsDir, toolsDir, dataComponentsDir, artifactComponentsDir, statusComponentsDir, environmentsDir } = paths;
  
  // Global name registry to prevent conflicts across all generated files
  const globalNameRegistry = new Set<string>();
  const componentNameMap = new Map<string, { name: string; type: ComponentType }>();
  
  // Phase 1: Register all component names to prevent conflicts
  
  // Register tools
  if (project.tools) {
    for (const toolId of Object.keys(project.tools)) {
      const baseName = toolId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'tool', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`tool:${toolId}`, { name: uniqueName, type: 'tool' });
    }
  }
  
  // Register data components
  if (project.dataComponents) {
    for (const componentId of Object.keys(project.dataComponents)) {
      const baseName = componentId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'dataComponent', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`dataComponent:${componentId}`, { name: uniqueName, type: 'dataComponent' });
    }
  }
  
  // Register artifact components
  if (project.artifactComponents) {
    for (const componentId of Object.keys(project.artifactComponents)) {
      const baseName = componentId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'artifactComponent', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`artifactComponent:${componentId}`, { name: uniqueName, type: 'artifactComponent' });
    }
  }
  
  // Register status components from agent statusUpdates
  if (project.agents) {
    for (const agent of Object.values(project.agents)) {
      if ((agent as any).statusUpdates?.statusComponents) {
        for (const statusComp of (agent as any).statusUpdates.statusComponents) {
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId) {
            const baseName = statusCompId
              .toLowerCase()
              .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
              .replace(/[^a-zA-Z0-9]/g, '')
              .replace(/^[0-9]/, '_$&');
            const uniqueName = ensureUniqueName(baseName, 'statusComponent', globalNameRegistry);
            globalNameRegistry.add(uniqueName);
            componentNameMap.set(`statusComponent:${statusCompId}`, { name: uniqueName, type: 'statusComponent' });
          }
        }
      }
    }
  }
  
  // Register agents
  if (project.agents) {
    for (const agentId of Object.keys(project.agents)) {
      const baseName = agentId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'agent', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`agent:${agentId}`, { name: uniqueName, type: 'agent' });
    }
  }
  
  // Register subAgents
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.subAgents) {
        for (const subAgentId of Object.keys(agentData.subAgents)) {
          const baseName = subAgentId
            .toLowerCase()
            .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '')
            .replace(/^[0-9]/, '_$&');
          const uniqueName = ensureUniqueName(baseName, 'subAgent', globalNameRegistry);
          globalNameRegistry.add(uniqueName);
          componentNameMap.set(`subAgent:${subAgentId}`, { name: uniqueName, type: 'subAgent' });
        }
      }
    }
  }
  
  // Register project itself
  const projectBaseName = project.id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
  const projectUniqueName = ensureUniqueName(projectBaseName, 'project', globalNameRegistry);
  globalNameRegistry.add(projectUniqueName);
  componentNameMap.set(`project:${project.id}`, { name: projectUniqueName, type: 'project' });
  
  // Phase 2: Generate files using the registered names
  
  // Generate tools
  if (project.tools) {
    for (const [toolId, toolData] of Object.entries(project.tools)) {
      if (diff.tools.added.includes(toolId) || diff.tools.modified.includes(toolId)) {
        const toolCode = generateToolFile(toolId, toolData, style);
        const fileName = toolId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const filePath = join(toolsDir, `${fileName}.ts`);
        writeFileSync(filePath, toolCode);
        if (debug) {
          console.log(chalk.gray(`  ✓ Generated: tools/${fileName}.ts`));
        }
      }
    }
  }

  // Generate data components
  if (project.dataComponents) {
    for (const [componentId, componentData] of Object.entries(project.dataComponents)) {
      if (diff.dataComponents.added.includes(componentId) || diff.dataComponents.modified.includes(componentId)) {
        const componentCode = generateDataComponentFile(componentId, componentData, style);
        const fileName = componentId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const filePath = join(dataComponentsDir, `${fileName}.ts`);
        writeFileSync(filePath, componentCode);
        if (debug) {
          console.log(chalk.gray(`  ✓ Generated: data-components/${fileName}.ts`));
        }
      }
    }
  }

  // Generate artifact components
  if (project.artifactComponents) {
    for (const [componentId, componentData] of Object.entries(project.artifactComponents)) {
      if (diff.artifactComponents.added.includes(componentId) || diff.artifactComponents.modified.includes(componentId)) {
        const componentCode = generateArtifactComponentFile(componentId, componentData, style);
        const fileName = componentId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const filePath = join(artifactComponentsDir, `${fileName}.ts`);
        writeFileSync(filePath, componentCode);
        if (debug) {
          console.log(chalk.gray(`  ✓ Generated: artifact-components/${fileName}.ts`));
        }
      }
    }
  }

  // Generate status components from agent statusUpdates
  if (project.agents) {
    const statusComponentsGenerated = new Set<string>();
    for (const agent of Object.values(project.agents)) {
      if ((agent as any).statusUpdates?.statusComponents) {
        for (const statusComp of (agent as any).statusUpdates.statusComponents) {
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId && !statusComponentsGenerated.has(statusCompId)) {
            const componentCode = generateStatusComponentFile(statusCompId, statusComp, style);
            const fileName = statusCompId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const filePath = join(statusComponentsDir, `${fileName}.ts`);
            writeFileSync(filePath, componentCode);
            statusComponentsGenerated.add(statusCompId);
            if (debug) {
              console.log(chalk.gray(`  ✓ Generated: status-components/${fileName}.ts`));
            }
          }
        }
      }
    }
  }

  // Generate environment files (always generate, even if no credentials)
  const envFiles = generateEnvironmentFiles(targetEnv, project.credentialReferences || {}, style);
  for (const [fileName, content] of Object.entries(envFiles)) {
    const filePath = join(environmentsDir, fileName);
    writeFileSync(filePath, content);
    if (debug) {
      console.log(chalk.gray(`  ✓ Generated: environments/${fileName}`));
    }
  }

  // Generate agents
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (diff.agents.added.includes(agentId) || diff.agents.modified.includes(agentId)) {
        const agentCode = generateAgentFile(agentId, agentData, project, style, componentNameMap);
        const fileName = agentId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const filePath = join(agentsDir, `${fileName}.ts`);
        writeFileSync(filePath, agentCode);
        if (debug) {
          console.log(chalk.gray(`  ✓ Generated: agents/${fileName}.ts`));
        }
      }
    }
  }

  // Always regenerate index file if there are any changes
  if (diff.hasChanges) {
    const indexCode = generateIndexFile(project, componentNameMap, style);
    const indexPath = join(projectRoot, 'index.ts');
    writeFileSync(indexPath, indexCode);
    if (debug) {
      console.log(chalk.gray(`  ✓ Generated: index.ts`));
    }
  }
}

/**
 * Main pull-v2 command
 */
export async function pullV2Command(options: PullV2Options): Promise<void> {
  // Perform background version check (non-blocking)
  performBackgroundVersionCheck();

  console.log(chalk.blue('\n🚀 Pull v2 - Deterministic project generation'));
  console.log(chalk.gray('  No LLM required • Fast • Consistent'));

  const s = p.spinner();
  s.start('Loading configuration...');

  try {
    let config: NestedInkeepConfig | null = null;
    let configFound = false;
    let configLocation = '';

    // Determine initial search directory for config
    const searchDir = process.cwd();

    // If a specific config file was provided, use that
    if (options.config) {
      const configPath = resolve(process.cwd(), options.config);
      if (existsSync(configPath)) {
        try {
          config = await loadProjectConfig(dirname(configPath), options.config);
          configFound = true;
          configLocation = configPath;
        } catch (error) {
          s.stop('Failed to load specified configuration file');
          console.error(
            chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
          );
          process.exit(1);
        }
      } else {
        s.stop(`Specified configuration file not found: ${configPath}`);
        process.exit(1);
      }
    }

    // If no config specified, search for inkeep.config.ts
    if (!configFound) {
      // Check current directory first
      const currentConfigPath = join(searchDir, 'inkeep.config.ts');
      if (existsSync(currentConfigPath)) {
        try {
          config = await loadProjectConfig(searchDir);
          configFound = true;
          configLocation = currentConfigPath;
        } catch (_error) {
          console.log(chalk.yellow('⚠️  Failed to load configuration from current directory'));
        }
      }

      // Check parent directory if not found in current
      if (!configFound) {
        const parentConfigPath = join(searchDir, '..', 'inkeep.config.ts');
        if (existsSync(parentConfigPath)) {
          try {
            config = await loadProjectConfig(join(searchDir, '..'));
            configFound = true;
            configLocation = parentConfigPath;
          } catch (_error) {
            console.log(chalk.yellow('⚠️  Failed to load configuration from parent directory'));
          }
        }
      }

      // Use find-up as last resort
      if (!configFound) {
        const { findUp } = await import('find-up');
        const foundConfigPath = await findUp('inkeep.config.ts', { cwd: searchDir });
        if (foundConfigPath) {
          try {
            config = await loadProjectConfig(dirname(foundConfigPath));
            configFound = true;
            configLocation = foundConfigPath;
          } catch (_error) {
            console.log(chalk.yellow('⚠️  Failed to load configuration from found path'));
          }
        }
      }
    }

    if (!configFound || !config) {
      s.stop('Configuration not found');
      console.error(chalk.red('\n❌ Error: Could not find inkeep.config.ts'));
      console.error(chalk.yellow('   Please ensure your configuration file exists and is valid.'));
      process.exit(1);
    }

    s.message('Configuration loaded successfully');
    if (options.debug) {
      console.log(chalk.gray(`\n📄 Config loaded from: ${configLocation}`));
      console.log(chalk.gray(`   Tenant ID: ${config.tenantId}`));
      console.log(chalk.gray(`   Manage API: ${config.agentsManageApi.url}`));
    }

    // Determine project ID
    let projectId = options.project;
    if (!projectId) {
      s.stop('Project ID required');
      console.error(chalk.red('\n❌ Error: Project ID is required'));
      console.error(chalk.yellow('   Use: --project <project-id> or specify in current directory'));
      process.exit(1);
    }

    // Initialize API client
    const apiClient = await ManagementApiClient.create(
      config.agentsManageApi.url,
      options.config,
      config.tenantId,
      projectId
    );

    // Fetch project data
    s.start(`Fetching project data: ${projectId}`);
    let projectData: FullProjectDefinition;
    try {
      projectData = await apiClient.getFullProject(projectId);
      s.message(`Project data fetched: ${projectData.name}`);
      if (options.debug) {
        console.log(chalk.gray(`\n📊 Project: ${projectData.name} (${projectData.id})`));
        console.log(chalk.gray(`   Agents: ${Object.keys(projectData.agents || {}).length}`));
        console.log(chalk.gray(`   Tools: ${Object.keys(projectData.tools || {}).length}`));
        console.log(chalk.gray(`   Data Components: ${Object.keys(projectData.dataComponents || {}).length}`));
        console.log(chalk.gray(`   Artifact Components: ${Object.keys(projectData.artifactComponents || {}).length}`));
      }
    } catch (error) {
      s.stop(`Failed to fetch project: ${projectId}`);
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }

    // JSON output mode
    if (options.json) {
      s.stop('Project data fetched');
      console.log(JSON.stringify(projectData, null, 2));
      process.exit(0);
    }

    // Determine output directory
    const outputDir = (config.outputDirectory && config.outputDirectory !== 'default') 
      ? config.outputDirectory 
      : process.cwd();
    const projectDir = resolve(outputDir);
    
    // Create project structure
    s.start('Creating project structure...');
    const paths = createProjectStructure(projectDir, projectId, false);
    
    // Read existing project if it exists
    const existingProject = await readExistingProject(paths.projectRoot);
    
    // Compare projects to determine what needs updating
    const diff = compareProjects(existingProject, projectData);
    
    if (options.debug) {
      console.log(chalk.gray('\n🔍 Project Diff:'));
      console.log(chalk.gray(`   Has changes: ${diff.hasChanges}`));
      if (diff.hasChanges) {
        console.log(chalk.gray(`   Agents - Added: ${diff.agents.added.length}, Modified: ${diff.agents.modified.length}, Removed: ${diff.agents.removed.length}`));
        console.log(chalk.gray(`   Tools - Added: ${diff.tools.added.length}, Modified: ${diff.tools.modified.length}, Removed: ${diff.tools.removed.length}`));
        console.log(chalk.gray(`   Data Components - Added: ${diff.dataComponents.added.length}, Modified: ${diff.dataComponents.modified.length}, Removed: ${diff.dataComponents.removed.length}`));
        console.log(chalk.gray(`   Artifact Components - Added: ${diff.artifactComponents.added.length}, Modified: ${diff.artifactComponents.modified.length}, Removed: ${diff.artifactComponents.removed.length}`));
      }
    }

    if (!diff.hasChanges && !options.force) {
      s.stop('No changes detected');
      console.log(chalk.green('✅ Project is already up to date'));
      return;
    }

    // Generate files
    const targetEnv = options.env || 'development';
    const codeStyle = DEFAULT_CODE_STYLE;
    
    s.start('Generating TypeScript files...');
    await generateFiles(projectData, diff, paths, targetEnv, codeStyle, options.debug || false);
    
    s.stop('Files generated successfully');
    
    // Success message
    console.log(chalk.green(`\n✅ Project generated successfully!`));
    console.log(chalk.gray(`   📁 Location: ${paths.projectRoot}`));
    console.log(chalk.gray(`   🌍 Environment: ${targetEnv}`));
    
    if (diff.hasChanges) {
      const totalChanges = diff.agents.added.length + diff.agents.modified.length +
                          diff.tools.added.length + diff.tools.modified.length +
                          diff.dataComponents.added.length + diff.dataComponents.modified.length +
                          diff.artifactComponents.added.length + diff.artifactComponents.modified.length;
      console.log(chalk.gray(`   📝 Files updated: ${totalChanges + 1} (including index.ts)`));
    }

    // Ensure clean exit
    process.exit(0);
    
  } catch (error) {
    s.stop('Failed');
    console.error(chalk.red(`\nUnexpected error: ${error instanceof Error ? error.message : String(error)}`));
    if (options.debug) {
      console.error(chalk.red(error instanceof Error ? error.stack || '' : ''));
    }
    process.exit(1);
  }
}