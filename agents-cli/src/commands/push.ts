import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabaseClient, createProject, getProject } from '@inkeep/agents-core';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { ManagementApiClient } from '../api.js';
import { validateConfiguration } from '../utils/config.js';
import { importWithTypeScriptSupport } from '../utils/tsx-loader.js';

export interface PushOptions {
  tenantId?: string;
  managementApiUrl?: string;
  configFilePath?: string;
}

export async function pushCommand(graphPath: string, options: PushOptions) {
  const spinner = ora('Loading graph configuration...').start();

  try {
    // Resolve the absolute path
    const absolutePath = resolve(process.cwd(), graphPath);

    // Check if file exists
    if (!existsSync(absolutePath)) {
      spinner.fail('Graph file not found');
      console.error(chalk.red(`File not found: ${absolutePath}`));
      process.exit(1);
    }

    // Import the module with TypeScript support
    spinner.text = 'Loading graph module...';
    const module = await importWithTypeScriptSupport(absolutePath);

    // Validate that exactly one graph is exported
    const exports = Object.keys(module);
    const graphExports = exports.filter((key) => {
      const value = module[key];
      // Check for AgentGraph-like objects (has required methods)
      return (
        value &&
        typeof value === 'object' &&
        typeof value.init === 'function' &&
        typeof value.getId === 'function' &&
        typeof value.getName === 'function' &&
        typeof value.getAgents === 'function'
      );
    });

    if (graphExports.length === 0) {
      spinner.fail('No AgentGraph exported from configuration file');
      console.error(chalk.red('Configuration file must export at least one AgentGraph instance'));
      process.exit(1);
    }

    if (graphExports.length > 1) {
      spinner.fail('Multiple AgentGraphs exported from configuration file');
      console.error(chalk.red('Configuration file must export exactly one AgentGraph instance'));
      console.error(chalk.yellow('Found exports:'), graphExports.join(', '));
      process.exit(1);
    }

    // Get the graph instance
    const graphKey = graphExports[0];
    const graph = module[graphKey];

    spinner.text = 'Loading configuration...';

    // Validate configuration
    let config: any;
    try {
      config = await validateConfiguration(
        options.tenantId,
        options.managementApiUrl,
        undefined, // executionApiUrl not needed for push
        options.configFilePath
      );
    } catch (error: any) {
      spinner.fail('Configuration validation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }

    spinner.succeed('Configuration loaded');

    // Log configuration sources for debugging
    console.log(chalk.gray('Configuration sources:'));
    console.log(chalk.gray(`  • Tenant ID: ${config.sources.tenantId}`));
    console.log(chalk.gray(`  • Project ID: ${config.sources.projectId}`));
    console.log(chalk.gray(`  • API URL: ${config.sources.managementApiUrl}`));

    const tenantId = config.tenantId;
    const projectId = config.projectId;
    const managementApiUrl = config.managementApiUrl;

    // Check if project exists in the database
    spinner.text = 'Validating project...';

    // Use local.db to check if project exists
    let dbUrl = process.env.DB_FILE_NAME || 'local.db';

    // Convert relative path to absolute path for libsql
    if (
      dbUrl !== ':memory:' &&
      !dbUrl.startsWith('file:') &&
      !dbUrl.startsWith('libsql:') &&
      !dbUrl.startsWith('http')
    ) {
      const absolutePath = resolve(process.cwd(), dbUrl);

      // Validate database file exists
      if (!existsSync(absolutePath)) {
        spinner.fail(`Database file not found: ${absolutePath}`);
        console.error(
          chalk.red(
            'Please ensure the database file exists or set DB_FILE_NAME environment variable'
          )
        );
        process.exit(1);
      }

      dbUrl = `file:${absolutePath}`;
    }

    const dbClient = createDatabaseClient({ url: dbUrl });

    const existingProject = await getProject(dbClient)({
      scopes: { tenantId, projectId },
    });

    if (!existingProject) {
      spinner.warn(`Project "${projectId}" does not exist`);
      spinner.stop(); // Stop spinner before prompting

      // Ask user if they want to create the project
      const { shouldCreate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldCreate',
          message: `Project "${projectId}" does not exist. Would you like to create it?`,
          default: true,
        },
      ]);

      if (!shouldCreate) {
        console.log(chalk.yellow('Push cancelled. Project must exist before pushing a graph.'));
        process.exit(0);
      }

      // Prompt for project details
      const { projectName, projectDescription } = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'Enter a name for the project:',
          default: projectId,
          validate: (input: any) => {
            if (!input || input.trim() === '') {
              return 'Project name is required';
            }
            return true;
          },
        },
        {
          type: 'input',
          name: 'projectDescription',
          message: 'Enter a description for the project (optional):',
          default: '',
        },
      ]);

      // Create the project
      spinner.start('Creating project...');
      try {
        await createProject(dbClient)({
          id: projectId,
          tenantId: tenantId,
          name: projectName,
          description: projectDescription || 'No description provided',
        });
        spinner.succeed(`Project "${projectName}" created successfully`);
      } catch (error: any) {
        spinner.fail('Failed to create project');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    } else {
      spinner.succeed(`Project "${existingProject.name || projectId}" validated`);
    }

    // Create API client with validated configuration (not used directly since graph handles its own API calls)
    await ManagementApiClient.create(
      config.managementApiUrl,
      options.configFilePath,
      config.tenantId
    );

    // Inject configuration into the graph
    if (typeof graph.setConfig === 'function') {
      graph.setConfig(tenantId, projectId, managementApiUrl);
    }

    spinner.start('Initializing graph...');

    // Initialize the graph (this will push to the backend)
    await graph.init();

    // Get graph details
    const graphId = graph.getId();
    const graphName = graph.getName();
    const stats = graph.getStats();

    spinner.succeed(`Graph "${graphName}" (${graphId}) pushed successfully`);

    // Validate for dangling resources
    const agents = graph.getAgents();
    const warnings: string[] = [];

    // Check for agents not referenced in any relationships
    for (const agent of agents) {
      const agentName = agent.getName();
      let isReferenced = false;

      // Check if this agent is referenced by any other agent
      for (const otherAgent of agents) {
        if (otherAgent === agent) continue;

        // Check transfers (only for internal agents)
        if (typeof otherAgent.getTransfers === 'function') {
          const transfers = otherAgent.getTransfers();
          if (transfers.some((h: any) => h.getName() === agentName)) {
            isReferenced = true;
            break;
          }
        }

        // Check delegates (only for internal agents)
        if (typeof otherAgent.getDelegates === 'function') {
          const delegates = otherAgent.getDelegates();
          if (delegates.some((d: any) => d.getName() === agentName)) {
            isReferenced = true;
            break;
          }
        }
      }

      // Check if it's the default agent
      const defaultAgent = graph.getDefaultAgent();
      if (defaultAgent && defaultAgent.getName() === agentName) {
        isReferenced = true;
      }

      if (!isReferenced && agents.length > 1) {
        warnings.push(
          `Agent "${agentName}" is not referenced in any transfer or delegation relationships`
        );
      }
    }

    // Display warnings if any
    if (warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      warnings.forEach((warning) => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    // Display summary
    console.log(chalk.cyan('\n📊 Graph Summary:'));
    console.log(chalk.gray(`  • Graph ID: ${graphId}`));
    console.log(chalk.gray(`  • Name: ${graphName}`));
    console.log(chalk.gray(`  • Agents: ${stats.agentCount}`));
    console.log(chalk.gray(`  • Tools: ${stats.toolCount}`));
    console.log(chalk.gray(`  • Relations: ${stats.relationCount}`));

    // Provide next steps
    console.log(chalk.green('\n✨ Next steps:'));
    console.log(chalk.gray(`  • Test your graph: inkeep chat ${graphId}`));
    console.log(chalk.gray(`  • View all graphs: inkeep list-graphs`));
    console.log(chalk.gray(`  • Get graph details: inkeep get-graph ${graphId}`));

    // Force exit to avoid hanging due to OpenTelemetry or other background tasks
    process.exit(0);
  } catch (error: any) {
    spinner.fail('Failed to push graph');
    console.error(chalk.red('Error:'), error.message);

    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}
