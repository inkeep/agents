import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import type { FullGraphDefinition } from '../types/graph.js';
import { type ValidatedConfiguration, validateConfiguration } from '../utils/config.js';
import { compareJsonObjects, getDifferenceSummary } from '../utils/json-comparator.js';
import { importWithTypeScriptSupport } from '../utils/tsx-loader.js';
import { generateTypeScriptFileWithLLM } from './pull.llm-generate.js';

export interface PullOptions {
  tenantId?: string;
  apiUrl?: string;
  configFilePath?: string;
  outputPath?: string;
  json?: boolean;
  maxRetries?: number;
}

/**
 * Convert a TypeScript graph file to its JSON representation
 * Uses the exact same approach as the push command
 */
export async function convertTypeScriptToJson(graphPath: string): Promise<FullGraphDefinition> {
  // Resolve the absolute path
  const absolutePath = resolve(process.cwd(), graphPath);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // Import the module with TypeScript support
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
    throw new Error('No AgentGraph exported from configuration file');
  }

  if (graphExports.length > 1) {
    throw new Error(
      `Multiple AgentGraphs exported from configuration file. Found: ${graphExports.join(', ')}`
    );
  }

  // Get the graph instance
  const graphKey = graphExports[0];
  const graph = module[graphKey];

  // Get the full graph definition using the same method as push
  return await graph.toFullGraphDefinition();
}

/**
 * CLI entry point for the converter (used when running with tsx)
 */
async function cliConvert(graphPath: string): Promise<void> {
  try {
    // Suppress ALL console output except our JSON
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;

    // Suppress all console output
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    console.info = () => {};

    const result = await convertTypeScriptToJson(graphPath);

    // Restore console functions
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;

    // Output a clear marker before JSON so parent process knows where to start parsing
    console.log('===JSON_START===');
    console.log(JSON.stringify(result, null, 2));
    console.log('===JSON_END===');
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

export async function pullCommand(graphId: string, options: PullOptions) {
  const spinner = ora('Loading configuration...').start();

  try {
    // Validate configuration
    let config: ValidatedConfiguration;
    try {
      config = await validateConfiguration(
        options.tenantId,
        options.apiUrl,
        options.configFilePath
      );
    } catch (error: any) {
      spinner.fail('Configuration validation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }

    // Get output directory from options or config
    const outputDirectory =
      options.outputPath || config.outputDirectory || './agent-configurations';

    // Create output directory if it doesn't exist
    const absoluteOutputPath = resolve(process.cwd(), outputDirectory);
    if (!existsSync(absoluteOutputPath)) {
      mkdirSync(absoluteOutputPath, { recursive: true });
    }

    spinner.text = 'Fetching graph from API...';

    // Fetch graph from API
    const response = await fetch(
      `${config.managementApiUrl}/tenants/${config.tenantId}/crud/projects/${config.projectId}/graph/${graphId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        spinner.fail(`Graph with ID "${graphId}" not found`);
        process.exit(1);
      }
      spinner.fail(`Failed to fetch graph: ${response.statusText}`);
      process.exit(1);
    }

    const responseData = await response.json();
    const graphData: any = responseData.data;

    if (options.json) {
      // Output JSON file
      spinner.text = 'Writing JSON file...';
      const jsonFilePath = join(absoluteOutputPath, `${graphId}.json`);
      writeFileSync(jsonFilePath, JSON.stringify(graphData, null, 2), 'utf-8');

      spinner.succeed(`Graph "${graphData.name}" pulled successfully`);
      console.log(chalk.green(`✅ JSON file created: ${jsonFilePath}`));

      // Display next steps for JSON
      console.log(chalk.cyan('\n✨ Next steps:'));
      console.log(chalk.gray(`  • View the file: ${jsonFilePath}`));
      console.log(chalk.gray(`  • Use the data in your application`));
    } else {
      // Generate TypeScript file using LLM
      spinner.text = 'Generating TypeScript file with LLM...';
      const outputFilePath = join(absoluteOutputPath, `${graphId}.graph.ts`);

      if (!config.modelSettings) {
        spinner.fail('Model Settings is required for TypeScript generation');
        console.error(chalk.red('Error: No modelSettings found in configuration.'));
        console.error(chalk.yellow('Please add modelSettings to your inkeep.config.ts file.'));
        console.error(chalk.gray('Example:'));
        console.error(chalk.gray('  modelSettings: {'));
        console.error(chalk.gray('    model: "anthropic/claude-3-5-sonnet-20241022",'));
        console.error(chalk.gray('    providerOptions: { anthropic: {} }'));
        console.error(chalk.gray('  }'));
        process.exit(1);
      }

      // Generate TypeScript file with validation and retry logic
      const maxRetries = options.maxRetries || 3;
      let attempt = 1;
      let validationPassed = false;
      let previousDifferences: string[] = [];

      while (attempt <= maxRetries && !validationPassed) {
        if (attempt > 1) {
          spinner.text = `Regenerating TypeScript file (attempt ${attempt}/${maxRetries})...`;
        } else {
          spinner.text = 'Generating TypeScript file with LLM...';
        }

        await generateTypeScriptFileWithLLM(
          graphData,
          graphId,
          outputFilePath,
          config.modelSettings,
          {
            attempt,
            maxRetries,
            previousDifferences: attempt > 1 ? previousDifferences : undefined,
          }
        );

        // Always validate the generated TypeScript file
        spinner.text = 'Validating generated TypeScript file...';

        try {
          // Convert the generated TypeScript back to JSON
          const convertedResult = await convertTypeScriptToJson(outputFilePath);

          // Compare with the original graph data
          const comparison = compareJsonObjects(graphData, convertedResult, {
            ignoreArrayOrder: true,
            ignoreCase: false,
            ignoreWhitespace: false,
            showDetails: true,
          });

          if (comparison.isEqual) {
            validationPassed = true;
            spinner.succeed('TypeScript file validation passed');
            console.log(chalk.green('✅ Generated TypeScript file matches original graph data'));
          } else {
            // Collect differences for next retry
            previousDifferences = comparison.differences.map(
              (diff) => `${diff.path}: ${diff.description}`
            );

            if (attempt < maxRetries) {
              spinner.warn(`Validation failed (attempt ${attempt}/${maxRetries}), retrying...`);
              console.log(
                chalk.yellow(
                  '⚠️  Generated TypeScript file has differences from original graph data:'
                )
              );
              console.log(chalk.gray(getDifferenceSummary(comparison)));

              console.log(chalk.gray('\n🔄 Retrying with improved prompt...'));
            } else {
              // Final attempt failed
              spinner.fail('TypeScript file validation failed after all retries');
              console.log(chalk.red('❌ Generated TypeScript file has differences from original:'));
              console.log(chalk.gray(getDifferenceSummary(comparison)));

              console.log(
                chalk.yellow(
                  '\n💡 You may need to manually edit the generated file or check the LLM configuration.'
                )
              );
            }
          }
        } catch (validationError: any) {
          // Collect validation error for next retry
          previousDifferences = [`Validation error: ${validationError.message}`];

          if (attempt < maxRetries) {
            spinner.warn(`Validation failed (attempt ${attempt}/${maxRetries}), retrying...`);
            console.log(
              chalk.yellow(
                '⚠️  Could not validate generated TypeScript file against original graph data:'
              )
            );
            console.log(chalk.gray(validationError.message));
            console.log(
              chalk.gray(
                'This might be due to the generated file having syntax errors or missing dependencies.'
              )
            );
            console.log(chalk.gray('\n🔄 Retrying with improved prompt...'));
          } else {
            // Final attempt failed
            spinner.fail('TypeScript file validation failed after all retries');
            console.log(
              chalk.red(
                '❌ Could not validate generated TypeScript file against original graph data:'
              )
            );
            console.log(chalk.gray(validationError.message));
            console.log(
              chalk.gray(
                'This might be due to the generated file having syntax errors or missing dependencies.'
              )
            );
            console.log(
              chalk.yellow(
                '\n💡 You may need to manually edit the generated file or check the LLM configuration.'
              )
            );
          }
        }

        attempt++;
      }

      spinner.succeed(`Graph "${graphData.name}" pulled successfully`);
      console.log(chalk.green(`✅ TypeScript file created: ${outputFilePath}`));

      // Display next steps
      console.log(chalk.cyan('\n✨ Next steps:'));
      console.log(chalk.gray(`  • Edit the file: ${outputFilePath}`));
      console.log(chalk.gray(`  • Test locally: inkeep push ${outputFilePath}`));
      console.log(chalk.gray(`  • Version control: git add ${outputFilePath}`));
    }
  } catch (error: any) {
    spinner.fail('Failed to pull graph');
    console.error(chalk.red('Error:'), error.message);

    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}

// CLI entry point for conversion
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const graphPath = process.argv[3];

  if (command === 'convert' && graphPath) {
    cliConvert(graphPath);
  } else {
    console.error('Usage: tsx pull.js convert <graph-path>');
    process.exit(1);
  }
}
