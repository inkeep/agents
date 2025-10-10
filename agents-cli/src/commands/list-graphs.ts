import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { ManagementApiClient } from '../api';
import { initializeCommand } from '../utils/cli-pipeline';

export interface ListGraphsOptions {
  project: string; // required project ID
  config?: string;
  configFilePath?: string; // deprecated, kept for backward compatibility
}

export async function listGraphsCommand(options: ListGraphsOptions) {
  // Use standardized CLI pipeline for initialization
  const configPath = options.config || options.configFilePath;
  const { config } = await initializeCommand({
    configPath,
    showSpinner: false,
    logConfig: true,
  });

  console.log();

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
        chalk.gray(
          `No graphs found in project "${options.project}". Define graphs in your project and run: inkeep push`
        )
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
        graph.defaultSubAgentId || chalk.gray('None'),
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
