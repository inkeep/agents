import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelSettings } from '@inkeep/agents-core';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { env } from '../env';
import { findProjectDirectory } from '../utils/project-directory';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';
import {
  generateArtifactComponentFile,
  generateDataComponentFile,
  generateEnvironmentFiles,
  generateGraphFile,
  generateIndexFile,
  generateInkeepConfigFile,
  generateToolFile,
} from './pull.llm-generate';

export interface PullOptions {
  project?: string;
  agentsManageApiUrl?: string;
  env?: string;
  json?: boolean;
}

/**
 * Load and validate inkeep.config.ts
 */
async function loadProjectConfig(projectDir: string): Promise<{
  tenantId: string;
  projectId: string;
  agentsManageApiUrl: string;
}> {
  const configPath = join(projectDir, 'inkeep.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const configModule = await importWithTypeScriptSupport(configPath);

    // Look for default export or named export
    const config = configModule.default || configModule.config;

    if (!config) {
      throw new Error('No configuration found in inkeep.config.ts');
    }

    return {
      tenantId: config.tenantId || 'default',
      projectId: config.projectId || 'default',
      agentsManageApiUrl: config.agentsManageApiUrl || 'http://localhost:3002',
    };
  } catch (error: any) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Fetch project data from backend API
 */
async function fetchProjectData(tenantId: string, projectId: string, apiUrl: string): Promise<any> {
  const response = await fetch(`${apiUrl}/tenants/${tenantId}/project-full/${projectId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Project "${projectId}" not found`);
    }
    throw new Error(`Failed to fetch project: ${response.statusText}`);
  }

  const responseData = await response.json();
  return responseData.data;
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
  projectId: string
): {
  projectRoot: string;
  graphsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  environmentsDir: string;
} {
  const projectRoot = join(projectDir, projectId);
  const graphsDir = join(projectRoot, 'graphs');
  const toolsDir = join(projectRoot, 'tools');
  const dataComponentsDir = join(projectRoot, 'data-components');
  const artifactComponentsDir = join(projectRoot, 'artifact-components');
  const environmentsDir = join(projectRoot, 'environments');

  // Create all directories
  ensureDirectoryExists(projectRoot);
  ensureDirectoryExists(graphsDir);
  ensureDirectoryExists(toolsDir);
  ensureDirectoryExists(dataComponentsDir);
  ensureDirectoryExists(artifactComponentsDir);
  ensureDirectoryExists(environmentsDir);

  return {
    projectRoot,
    graphsDir,
    toolsDir,
    dataComponentsDir,
    artifactComponentsDir,
    environmentsDir,
  };
}

/**
 * Generate project files using LLM based on backend data
 */
async function generateProjectFiles(
  dirs: {
    projectRoot: string;
    graphsDir: string;
    toolsDir: string;
    dataComponentsDir: string;
    artifactComponentsDir: string;
    environmentsDir: string;
  },
  projectData: any,
  projectId: string,
  modelSettings: ModelSettings
): Promise<void> {
  const { graphs, tools, dataComponents, artifactComponents } = projectData;

  // Generate index.ts file
  console.log(chalk.gray('  • Generating index.ts...'));
  const indexPath = join(dirs.projectRoot, 'index.ts');
  await generateIndexFile(projectData, indexPath, modelSettings);

  // Generate inkeep.config.ts file (with projectId)
  console.log(chalk.gray('  • Generating inkeep.config.ts...'));
  const configPath = join(dirs.projectRoot, 'inkeep.config.ts');
  await generateInkeepConfigFile(projectData, projectId, configPath, modelSettings);

  // Generate graph files
  if (graphs && Object.keys(graphs).length > 0) {
    console.log(chalk.cyan('  📊 Generating graphs:'));
    for (const [graphId, graphData] of Object.entries(graphs)) {
      console.log(chalk.gray(`     • ${graphId}.ts`));
      const graphPath = join(dirs.graphsDir, `${graphId}.ts`);
      await generateGraphFile(graphData, graphId, graphPath, modelSettings);
    }
  }

  // Generate tool files
  if (tools && Object.keys(tools).length > 0) {
    console.log(chalk.cyan('  🔧 Generating tools:'));
    for (const [toolId, toolData] of Object.entries(tools)) {
      console.log(chalk.gray(`     • ${toolId}.ts`));
      const toolPath = join(dirs.toolsDir, `${toolId}.ts`);
      await generateToolFile(toolData, toolId, toolPath, modelSettings);
    }
  }

  // Generate data component files
  if (dataComponents && Object.keys(dataComponents).length > 0) {
    console.log(chalk.cyan('  📦 Generating data components:'));
    for (const [componentId, componentData] of Object.entries(dataComponents)) {
      console.log(chalk.gray(`     • ${componentId}.ts`));
      const componentPath = join(dirs.dataComponentsDir, `${componentId}.ts`);
      await generateDataComponentFile(componentData, componentId, componentPath, modelSettings);
    }
  }

  // Generate artifact component files
  if (artifactComponents && Object.keys(artifactComponents).length > 0) {
    console.log(chalk.cyan('  🎨 Generating artifact components:'));
    for (const [componentId, componentData] of Object.entries(artifactComponents)) {
      console.log(chalk.gray(`     • ${componentId}.ts`));
      const componentPath = join(dirs.artifactComponentsDir, `${componentId}.ts`);
      await generateArtifactComponentFile(componentData, componentId, componentPath, modelSettings);
    }
  }

  // Generate environment files
  console.log(chalk.cyan('  🔐 Generating environment templates:'));
  await generateEnvironmentFiles(dirs.environmentsDir, projectData);
}

/**
 * Main pull command
 */
export async function pullProjectCommand(options: PullOptions): Promise<void> {
  // Validate ANTHROPIC_API_KEY is available for LLM operations
  if (!env.ANTHROPIC_API_KEY) {
    console.error(
      chalk.red('Error: ANTHROPIC_API_KEY environment variable is required for the pull command.')
    );
    console.error(chalk.gray('Please set your Anthropic API key:'));
    console.error(chalk.gray('  export ANTHROPIC_API_KEY=your_api_key_here'));
    console.error(chalk.gray('  or add it to your .env file'));
    process.exit(1);
  }

  const spinner = ora('Finding project...').start();

  try {
    // Find the src directory or current directory
    let baseDir: string;
    if (options.project) {
      // If project path is specified, use it
      baseDir = options.project;
    } else {
      // Find the src directory by looking for package.json
      const projectRoot = await findProjectDirectory();
      if (projectRoot) {
        // Check if there's a src directory
        const srcPath = join(projectRoot, 'src');
        baseDir = existsSync(srcPath) ? srcPath : projectRoot;
      } else {
        // Use current directory as fallback
        baseDir = process.cwd();
      }
    }

    spinner.succeed(`Base directory: ${baseDir}`);

    // Load configuration from parent directory if it exists
    spinner.start('Loading configuration...');
    let config: any = {
      tenantId: 'default',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    // Try to load config from parent directory
    const parentConfigPath = join(baseDir, '..', 'inkeep.config.ts');
    if (existsSync(parentConfigPath)) {
      try {
        config = await loadProjectConfig(join(baseDir, '..'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not load configuration from parent directory'));
      }
    }

    // Override with CLI options
    const finalConfig = {
      tenantId: options.env || config.tenantId,
      projectId: '', // Will be determined from API response or user input
      agentsManageApiUrl: options.agentsManageApiUrl || config.agentsManageApiUrl,
    };

    // Prompt for project ID if not provided
    if (!options.project) {
      spinner.stop();
      const response = await prompts({
        type: 'text',
        name: 'projectId',
        message: 'Enter the project ID to pull:',
        validate: (value: string) => (value ? true : 'Project ID is required'),
      });

      if (!response.projectId) {
        console.error(chalk.red('Project ID is required'));
        process.exit(1);
      }
      finalConfig.projectId = response.projectId;
      spinner.start('Configuration loaded');
    } else {
      // Extract project ID from path if it's a directory name
      const projectIdFromPath = options.project.split('/').pop() || options.project;
      finalConfig.projectId = projectIdFromPath;
    }

    spinner.succeed('Configuration loaded');
    console.log(chalk.gray('Configuration:'));
    console.log(chalk.gray(`  • Tenant ID: ${finalConfig.tenantId}`));
    console.log(chalk.gray(`  • Project ID: ${finalConfig.projectId}`));
    console.log(chalk.gray(`  • API URL: ${finalConfig.agentsManageApiUrl}`));

    // Fetch project data
    spinner.start('Fetching project data from backend...');
    const projectData = await fetchProjectData(
      finalConfig.tenantId,
      finalConfig.projectId,
      finalConfig.agentsManageApiUrl
    );
    spinner.succeed('Project data fetched');

    // Show project summary
    const graphCount = Object.keys(projectData.graphs || {}).length;
    const toolCount = Object.keys(projectData.tools || {}).length;
    const agentCount = Object.values(projectData.graphs || {}).reduce(
      (total: number, graph: any) => {
        return total + Object.keys(graph.agents || {}).length;
      },
      0
    );

    console.log(chalk.cyan('\n📊 Project Summary:'));
    console.log(chalk.gray(`  • Name: ${projectData.name}`));
    console.log(chalk.gray(`  • Description: ${projectData.description || 'No description'}`));
    console.log(chalk.gray(`  • Graphs: ${graphCount}`));
    console.log(chalk.gray(`  • Tools: ${toolCount}`));
    console.log(chalk.gray(`  • Agents: ${agentCount}`));

    // Create project directory structure
    spinner.start('Creating project structure...');
    const dirs = createProjectStructure(baseDir, finalConfig.projectId);
    spinner.succeed('Project structure created');

    if (options.json) {
      // Save as JSON file
      const jsonFilePath = join(dirs.projectRoot, `${finalConfig.projectId}.json`);
      writeFileSync(jsonFilePath, JSON.stringify(projectData, null, 2));

      spinner.succeed(`Project data saved to ${jsonFilePath}`);
      console.log(chalk.green(`✅ JSON file created: ${jsonFilePath}`));
    }

    // Generate project files using LLM
    spinner.start('Generating project files with LLM...');

    // Get model settings from config or use default
    const modelSettings: ModelSettings = {
      model: 'anthropic/claude-sonnet-4-20250514',
    };

    await generateProjectFiles(dirs, projectData, finalConfig.projectId, modelSettings);

    // Count generated files for summary
    const fileCount = {
      graphs: Object.keys(projectData.graphs || {}).length,
      tools: Object.keys(projectData.tools || {}).length,
      dataComponents: Object.keys(projectData.dataComponents || {}).length,
      artifactComponents: Object.keys(projectData.artifactComponents || {}).length,
    };
    const totalFiles =
      fileCount.graphs +
      fileCount.tools +
      fileCount.dataComponents +
      fileCount.artifactComponents +
      3; // +3 for index.ts, inkeep.config.ts, and environment files

    spinner.succeed(`Project files generated (${totalFiles} files created)`);

    console.log(chalk.green('\n✨ Project pulled successfully!'));
    console.log(chalk.cyan('\n📁 Generated structure:'));
    console.log(chalk.gray(`  ${dirs.projectRoot}/`));
    console.log(chalk.gray(`  ├── index.ts`));
    console.log(chalk.gray(`  ├── inkeep.config.ts`));
    if (fileCount.graphs > 0) {
      console.log(chalk.gray(`  ├── graphs/ (${fileCount.graphs} files)`));
    }
    if (fileCount.tools > 0) {
      console.log(chalk.gray(`  ├── tools/ (${fileCount.tools} files)`));
    }
    if (fileCount.dataComponents > 0) {
      console.log(chalk.gray(`  ├── data-components/ (${fileCount.dataComponents} files)`));
    }
    if (fileCount.artifactComponents > 0) {
      console.log(chalk.gray(`  ├── artifact-components/ (${fileCount.artifactComponents} files)`));
    }
    console.log(chalk.gray(`  └── environments/`));

    console.log(chalk.cyan('\n📝 Next steps:'));
    console.log(chalk.gray(`  • cd ${dirs.projectRoot}`));
    console.log(chalk.gray('  • Review the generated files'));
    console.log(chalk.gray('  • Test locally: inkeep push'));
    console.log(
      chalk.gray('  • Commit changes: git add . && git commit -m "Add project from pull"')
    );
  } catch (error: any) {
    spinner.fail('Failed to pull project');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
