import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelSettings } from '@inkeep/agents-core';
import chalk from 'chalk';
import ora from 'ora';
import { categorizeTypeScriptFiles, findAllTypeScriptFiles } from '../utils/file-finder';
import { findProjectDirectory } from '../utils/project-directory';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';
import { generateTypeScriptFileWithLLM } from './pull.llm-generate';

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
 * Find all TypeScript files in the project that need updating
 * Excludes files in the environments directory
 */
function findProjectFiles(projectDir: string): {
  indexFile: string | null;
  graphFiles: string[];
  agentFiles: string[];
  toolFiles: string[];
  otherFiles: string[];
} {
  // Find all TypeScript files excluding environments directory
  const allTsFiles = findAllTypeScriptFiles(projectDir, ['environments', 'node_modules']);

  // Categorize the files
  const categorized = categorizeTypeScriptFiles(allTsFiles, projectDir);

  return {
    indexFile: categorized.indexFile,
    graphFiles: categorized.graphFiles,
    agentFiles: categorized.agentFiles,
    toolFiles: categorized.toolFiles,
    otherFiles: categorized.otherFiles,
  };
}

/**
 * Update project files using LLM based on backend data
 */
async function updateProjectFilesWithLLM(
  projectDir: string,
  projectData: any,
  modelSettings: ModelSettings
): Promise<void> {
  const { graphs, tools } = projectData;
  const { indexFile, graphFiles, agentFiles, toolFiles, otherFiles } = findProjectFiles(projectDir);

  // Update index.ts
  if (indexFile && existsSync(indexFile)) {
    console.log(chalk.gray('  • Updating index.ts...'));
    await generateTypeScriptFileWithLLM(projectData, 'project', indexFile, modelSettings);
  }

  // Update graph files
  for (const graphFilePath of graphFiles) {
    const fileName = graphFilePath.split('/').pop()?.replace('.ts', '').replace('.graph', '');
    if (fileName && graphs[fileName]) {
      console.log(chalk.gray(`  • Updating graph: ${fileName}`));
      await generateTypeScriptFileWithLLM(graphs[fileName], fileName, graphFilePath, modelSettings);
    }
  }

  // Update agent files
  for (const agentFilePath of agentFiles) {
    const fileName = agentFilePath.split('/').pop()?.replace('.ts', '');
    if (fileName) {
      // Find the agent in any graph
      let agentData = null;
      for (const graph of Object.values(graphs)) {
        const graphData = graph as any;
        if (graphData.agents?.[fileName]) {
          agentData = graphData.agents[fileName];
          break;
        }
      }
      if (agentData) {
        console.log(chalk.gray(`  • Updating agent: ${fileName}`));
        await generateTypeScriptFileWithLLM(agentData, fileName, agentFilePath, modelSettings);
      }
    }
  }

  // Update tool files
  for (const toolFilePath of toolFiles) {
    const fileName = toolFilePath.split('/').pop()?.replace('.ts', '');
    if (fileName && tools[fileName]) {
      console.log(chalk.gray(`  • Updating tool: ${fileName}`));
      await generateTypeScriptFileWithLLM(tools[fileName], fileName, toolFilePath, modelSettings);
    }
  }

  // Update other TypeScript files with project context
  for (const otherFilePath of otherFiles) {
    const fileName = otherFilePath.split('/').pop()?.replace('.ts', '');
    if (fileName) {
      console.log(chalk.gray(`  • Updating file: ${fileName}.ts`));
      // Use the entire project data as context for other files
      await generateTypeScriptFileWithLLM(projectData, fileName, otherFilePath, modelSettings);
    }
  }
}

/**
 * Main pull command
 */
export async function pullProjectCommand(options: PullOptions): Promise<void> {
  const spinner = ora('Finding project...').start();

  try {
    // Find project directory
    const projectDir = await findProjectDirectory(options.project);
    if (!projectDir) {
      spinner.fail('Project not found');
      console.error(chalk.red('Error: No project found.'));
      console.error(
        chalk.gray(
          'Either run this command from within a project directory or specify --project <project-id>'
        )
      );
      process.exit(1);
    }

    spinner.succeed(`Project found: ${projectDir}`);

    // Load configuration
    spinner.start('Loading configuration...');
    const config = await loadProjectConfig(projectDir);

    // Override with CLI options
    const finalConfig = {
      tenantId: options.agentsManageApiUrl ? options.env || config.tenantId : config.tenantId,
      projectId: config.projectId,
      agentsManageApiUrl: options.agentsManageApiUrl || config.agentsManageApiUrl,
    };

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

    if (options.json) {
      // Save as JSON file
      const jsonFilePath = join(projectDir, `${finalConfig.projectId}.json`);
      writeFileSync(jsonFilePath, JSON.stringify(projectData, null, 2));

      spinner.succeed(`Project data saved to ${jsonFilePath}`);
      console.log(chalk.green(`✅ JSON file created: ${jsonFilePath}`));
    } else {
      // Update project files using LLM
      spinner.start('Updating project files with LLM...');

      // Get model settings from config or use default
      const modelSettings: ModelSettings = {
        model: 'anthropic/claude-sonnet-4-20250514',
      };

      // Get file counts for summary
      const { indexFile, graphFiles, agentFiles, toolFiles, otherFiles } =
        findProjectFiles(projectDir);
      const totalFiles =
        [indexFile].filter(Boolean).length +
        graphFiles.length +
        agentFiles.length +
        toolFiles.length +
        otherFiles.length;

      await updateProjectFilesWithLLM(projectDir, projectData, modelSettings);
      spinner.succeed(`Project files updated (${totalFiles} files processed)`);

      console.log(chalk.green('\n✨ Project pulled successfully!'));
      console.log(chalk.cyan('\n📝 Next steps:'));
      console.log(chalk.gray('  • Review the updated files'));
      console.log(chalk.gray('  • Test locally: npx inkeep push'));
      console.log(
        chalk.gray('  • Commit changes: git add . && git commit -m "Pull project updates"')
      );
    }
  } catch (error: any) {
    spinner.fail('Failed to pull project');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}
