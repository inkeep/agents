import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import type { FullGraphDefinition } from '../types/graph';
import { type ValidatedConfiguration, validateConfiguration } from '../utils/config';
import { compareJsonObjects, getDifferenceSummary } from '../utils/json-comparator';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';
import { generateTypeScriptFileWithLLM } from './pull.llm-generate';

export interface PullOptions {
  tenantId?: string;
  apiUrl?: string;
  configFilePath?: string;
  outputPath?: string;
  json?: boolean;
  maxRetries?: number;
}

/**
 * Determine if the output path is a directory or file and return the appropriate file path
 */
function resolveOutputFilePath(
  outputPath: string,
  graphId: string,
  isJson: boolean
): {
  filePath: string;
  isExistingFile: boolean;
} {
  const absoluteOutputPath = resolve(process.cwd(), outputPath);

  // Check if the path exists
  if (existsSync(absoluteOutputPath)) {
    const stats = statSync(absoluteOutputPath);

    if (stats.isDirectory()) {
      // It's a directory, create file path with graph ID
      const extension = isJson ? '.json' : '.graph.ts';
      const filePath = join(absoluteOutputPath, `${graphId}${extension}`);
      return {
        filePath,
        isExistingFile: existsSync(filePath),
      };
    } else {
      // It's a file, use it directly
      return {
        filePath: absoluteOutputPath,
        isExistingFile: true,
      };
    }
  } else {
    // Path doesn't exist, check if it has an extension
    const extension = extname(absoluteOutputPath);

    if (extension) {
      // It's a file path (has extension), create parent directory if needed
      const parentDir = dirname(absoluteOutputPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
      return {
        filePath: absoluteOutputPath,
        isExistingFile: false,
      };
    } else {
      // It's a directory path, create it and return file path
      mkdirSync(absoluteOutputPath, { recursive: true });
      const extension = isJson ? '.json' : '.graph.ts';
      const filePath = join(absoluteOutputPath, `${graphId}${extension}`);
      return {
        filePath,
        isExistingFile: false,
      };
    }
  }
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

    // Get output path from options or use default
    const outputPath = options.outputPath || './graphs';

    // Resolve the output file path and determine if it's an existing file
    const { filePath: outputFilePath, isExistingFile } = resolveOutputFilePath(
      outputPath,
      graphId,
      !!options.json
    );

    spinner.text = 'Fetching graph from API...';

    // Fetch graph from API
    const response = await fetch(
      `${config.agentsManageApiUrl}/tenants/${config.tenantId}/crud/projects/${config.projectId}/graph/${graphId}`,
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
      writeFileSync(outputFilePath, JSON.stringify(graphData, null, 2), 'utf-8');

      spinner.succeed(`Graph "${graphData.name}" pulled successfully`);
      console.log(
        chalk.green(`✅ JSON file ${isExistingFile ? 'updated' : 'created'}: ${outputFilePath}`)
      );

      // Display next steps for JSON
      console.log(chalk.cyan('\n✨ Next steps:'));
      console.log(chalk.gray(`  • View the file: ${outputFilePath}`));
      console.log(chalk.gray(`  • Use the data in your application`));
    } else {
      // Generate TypeScript file with validation and retry logic
      const maxRetries = options.maxRetries || 3;
      let attempt = 1;
      let validationPassed = false;
      let previousDifferences: string[] = [];

      // Only validate when merging into existing file, not when creating new file
      const shouldValidate = isExistingFile;

      while (attempt <= maxRetries && (!shouldValidate || !validationPassed)) {
        if (attempt > 1) {
          spinner.text = `Regenerating TypeScript file (attempt ${attempt}/${maxRetries})...`;
        } else {
          spinner.text = isExistingFile
            ? 'Merging into existing TypeScript file with LLM...'
            : 'Generating TypeScript file with LLM...';
        }

        // TODO: configure this based on environment variable?
        const pullModel = config.modelSettings?.base || {
          model: 'anthropic/claude-sonnet-4-20250514',
        };

        await generateTypeScriptFileWithLLM(graphData, graphId, outputFilePath, pullModel, {
          attempt,
          maxRetries,
          previousDifferences: attempt > 1 ? previousDifferences : undefined,
        });

        // Only validate when merging into existing file
        if (shouldValidate) {
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
                console.log(
                  chalk.red('❌ Generated TypeScript file has differences from original:')
                );
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
        } else {
          // No validation needed for new files
          validationPassed = true;
        }

        attempt++;
      }

      spinner.succeed(`Graph "${graphData.name}" pulled successfully`);
      console.log(
        chalk.green(
          `✅ TypeScript file ${isExistingFile ? 'updated' : 'created'}: ${outputFilePath}`
        )
      );

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
