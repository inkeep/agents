import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { ManagementApiClient } from '../api';
import type { ValidatedConfiguration } from '../utils/config';
import { validateConfiguration } from '../utils/config';

export interface ListGraphsOptions {
  project: string; // required project ID
  tenantId?: string;
  agentsManageApiUrl?: string;
  config?: string;
  configFilePath?: string; // deprecated, kept for backward compatibility
}

export async function listGraphsCommand(options: ListGraphsOptions) {
  // Validate configuration
  let config: ValidatedConfiguration;

  try {
    // Use new config parameter, fall back to configFilePath for backward compatibility
    const configPath = options.config || options.configFilePath;
    config = await validateConfiguration(
      options.tenantId,
      options.agentsManageApiUrl,
      undefined, // agentsRunApiUrl not needed for list-graphs
      configPath
    );
  } catch (error: any) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }

  // Log configuration sources for debugging
  console.log(chalk.gray('Using configuration:'));
  console.log(chalk.gray(`  • Tenant ID: ${config.sources.tenantId}`));
  console.log(chalk.gray(`  • API URL: ${config.sources.agentsManageApiUrl}`));
  console.log();

  const configPath = options.config || options.configFilePath;
  const api = await ManagementApiClient.create(
    config.agentsManageApiUrl,
    configPath,
    config.tenantId,
    options.project // pass project ID as projectIdOverride
  );
  const spinner = ora('Fetching graphs...').start();

  try {
    const graphs = await api.listGraphs();
    spinner.succeed(`Found ${graphs.length} graph(s) in project "${options.project}"`);

    if (graphs.length === 0) {
      console.log(
        chalk.gray(`No graphs found in project "${options.project}". Define graphs in your project and run: inkeep push`)
      );
      return;
    }

    // Create a table to display graphs
    const table = new Table({
      head: [
        chalk.cyan('Graph ID'),
        chalk.cyan('Name'),
        chalk.cyan('Default Agent'),
        chalk.cyan('Created'),
      ],
      style: {
        head: [],
        border: [],
      },
    });

    for (const graph of graphs) {
      const createdDate = graph.createdAt
        ? new Date(graph.createdAt).toLocaleDateString()
        : 'Unknown';

      table.push([
        graph.id || '',
        graph.name || graph.id || '',
        graph.defaultAgentId || chalk.gray('None'),
        createdDate,
      ]);
    }

    console.log(`\n${table.toString()}`);
  } catch (error) {
    spinner.fail('Failed to fetch graphs');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
