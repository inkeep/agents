import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';
import { findProjectDirectory } from '../utils/project-directory';
import { loadEnvironmentCredentials } from '../utils/environment-loader';

export interface PushOptions {
  project?: string;
  agentsManageApiUrl?: string;
  env?: string;
  json?: boolean;
}


/**
 * Load and validate project from index.ts
 */
async function loadProject(projectDir: string) {
  const indexPath = join(projectDir, 'index.ts');

  if (!existsSync(indexPath)) {
    throw new Error(`index.ts not found in project directory: ${projectDir}`);
  }

  // Import the module with TypeScript support
  const module = await importWithTypeScriptSupport(indexPath);

  // Find the first export with __type = "project"
  const exports = Object.keys(module);
  for (const exportKey of exports) {
    const value = module[exportKey];
    if (value && typeof value === 'object' && value.__type === 'project') {
      return value;
    }
  }

  throw new Error(
    'No project export found in index.ts. Expected an export with __type = "project"'
  );
}

export async function pushCommand(options: PushOptions) {
  const spinner = ora('Detecting project...').start();

  try {
    // Find project directory
    const projectDir = await findProjectDirectory(options.project);

    if (!projectDir) {
      spinner.fail('Project not found');
      if (options.project) {
        console.error(chalk.red(`Project directory not found: ${options.project}`));
        console.error(
          chalk.yellow('Make sure the project directory contains an inkeep.config.ts file')
        );
      } else {
        console.error(chalk.red('No project found in current directory or parent directories'));
        console.error(
          chalk.yellow(
            'Either run this command from within a project directory or use --project <project-id>'
          )
        );
      }
      process.exit(1);
    }

    spinner.succeed(`Project found: ${projectDir}`);

    // Set environment if provided
    if (options.env) {
      process.env.INKEEP_ENV = options.env;
      spinner.text = `Setting environment to '${options.env}'...`;
    }

    // Load project from index.ts
    spinner.text = 'Loading project from index.ts...';
    const project = await loadProject(projectDir);

    spinner.succeed('Project loaded successfully');

    // Load inkeep.config.ts for configuration
    spinner.text = 'Loading configuration...';
    const configPath = join(projectDir, 'inkeep.config.ts');
    const configModule = await importWithTypeScriptSupport(configPath);
    const config = configModule.default;

    if (!config) {
      throw new Error('No default export found in inkeep.config.ts');
    }

    // Override config with CLI options
    const finalConfig = {
      ...config,
      agentsManageApiUrl: options.agentsManageApiUrl || config.agentsManageApiUrl,
    };

    if (!finalConfig.tenantId || !finalConfig.projectId || !finalConfig.agentsManageApiUrl) {
      throw new Error('Missing required configuration: tenantId, projectId, or agentsManageApiUrl');
    }

    spinner.succeed('Configuration loaded');

    // Log configuration sources
    console.log(chalk.gray('Configuration sources:'));
    console.log(chalk.gray(`  • Tenant ID: ${finalConfig.tenantId}`));
    console.log(chalk.gray(`  • Project ID: ${finalConfig.projectId}`));
    console.log(chalk.gray(`  • API URL: ${finalConfig.agentsManageApiUrl}`));

    // Set configuration on the project
    if (typeof project.setConfig === 'function') {
      project.setConfig(finalConfig.tenantId, finalConfig.agentsManageApiUrl, finalConfig.modelSettings);
    }

    // Load environment credentials if --env flag is provided
    if (options.env && typeof project.setCredentials === 'function') {
      spinner.text = `Loading credentials for environment '${options.env}'...`;
      
      try {
        const credentials = await loadEnvironmentCredentials(projectDir, options.env);
        project.setCredentials(credentials);
        
        spinner.text = 'Project loaded with credentials';
        console.log(chalk.gray(`  • Environment: ${options.env}`));
        console.log(chalk.gray(`  • Credentials loaded: ${Object.keys(credentials).length}`));
      } catch (error: any) {
        spinner.fail('Failed to load environment credentials');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    }

    // Dump project data to JSON file if --json flag is set
    if (options.json) {
      spinner.text = 'Generating project data JSON...';

      try {
        // Generate the project definition without initializing
        const projectDefinition = await (project as any).toFullProjectDefinition();

        // Create the JSON file path
        const jsonFilePath = join(projectDir, `${finalConfig.projectId}.json`);

        // Write the project data to JSON file
        const fs = await import('node:fs/promises');
        await fs.writeFile(jsonFilePath, JSON.stringify(projectDefinition, null, 2));

        spinner.succeed(`Project data saved to ${jsonFilePath}`);
        console.log(chalk.gray(`  • File: ${jsonFilePath}`));
        console.log(chalk.gray(`  • Size: ${JSON.stringify(projectDefinition).length} bytes`));

        // Show a summary of what was saved
        const graphCount = Object.keys(projectDefinition.graphs || {}).length;
        const toolCount = Object.keys(projectDefinition.tools || {}).length;
        const agentCount = Object.values(projectDefinition.graphs || {}).reduce(
          (total: number, graph: any) => {
            return total + Object.keys(graph.agents || {}).length;
          },
          0
        );

        console.log(chalk.cyan('\n📊 Project Data Summary:'));
        console.log(chalk.gray(`  • Graphs: ${graphCount}`));
        console.log(chalk.gray(`  • Tools: ${toolCount}`));
        console.log(chalk.gray(`  • Agents: ${agentCount}`));

        // Exit after generating JSON (don't initialize the project)
        console.log(chalk.green('\n✨ JSON file generated successfully!'));
        process.exit(0);
      } catch (error: any) {
        spinner.fail('Failed to generate JSON file');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    }

    // Initialize the project (this will push to the backend)
    spinner.start('Initializing project...');
    await project.init();

    // Get project details
    const projectId = project.getId();
    const projectName = project.getName();
    const stats = project.getStats();

    spinner.succeed(`Project "${projectName}" (${projectId}) pushed successfully`);

    // Display summary
    console.log(chalk.cyan('\n📊 Project Summary:'));
    console.log(chalk.gray(`  • Project ID: ${projectId}`));
    console.log(chalk.gray(`  • Name: ${projectName}`));
    console.log(chalk.gray(`  • Graphs: ${stats.graphCount}`));
    console.log(chalk.gray(`  • Tenant: ${stats.tenantId}`));

    // Display graph details if any
    const graphs = project.getGraphs();
    if (graphs.length > 0) {
      console.log(chalk.cyan('\n📊 Graph Details:'));
      for (const graph of graphs) {
        const graphStats = graph.getStats();
        console.log(
          chalk.gray(
            `  • ${graph.getName()} (${graph.getId()}): ${graphStats.agentCount} agents, ${graphStats.toolCount} tools`
          )
        );
      }
    }

    // Provide next steps
    console.log(chalk.green('\n✨ Next steps:'));
    console.log(chalk.gray(`  • Test your project: inkeep chat`));
    console.log(chalk.gray(`  • View all graphs: inkeep list-graphs`));

    // Force exit to avoid hanging due to OpenTelemetry or other background tasks
    process.exit(0);
  } catch (error: any) {
    spinner.fail('Failed to push project');
    console.error(chalk.red('Error:'), error.message);

    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}
