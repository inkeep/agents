import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { promptForModelConfiguration } from '../utils/model-config';

export interface InitOptions {
  path?: string;
  interactive?: boolean;
}

/**
 * Find the most appropriate directory for the config file by looking for
 * common project root indicators
 */
function findProjectRoot(startPath: string): string {
  let currentPath = resolve(startPath);
  const root = dirname(currentPath);

  // Look for common project root indicators
  const rootIndicators = [
    'package.json',
    '.git',
    '.gitignore',
    'tsconfig.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ];

  while (currentPath !== root) {
    const files = readdirSync(currentPath);

    // Check if any root indicators exist at this level
    if (rootIndicators.some((indicator) => files.includes(indicator))) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      break; // Reached filesystem root
    }
    currentPath = parentPath;
  }

  // If no project root found, use the original path
  return startPath;
}

export async function initCommand(options?: InitOptions) {
  let configPath: string;

  if (options?.path) {
    // User specified a path
    const resolvedPath = resolve(process.cwd(), options.path);

    // Check if it's a directory or a file path
    if (options.path.endsWith('.ts') || options.path.endsWith('.js')) {
      // It's a file path
      configPath = resolvedPath;
    } else {
      // It's a directory path
      configPath = join(resolvedPath, 'inkeep.config.ts');
    }
  } else {
    // Auto-detect project root
    const projectRoot = findProjectRoot(process.cwd());
    const suggestedPath = join(projectRoot, 'inkeep.config.ts');

    if (options?.interactive === false) {
      // Non-interactive mode: use the detected project root
      configPath = suggestedPath;
    } else {
      // Ask user to confirm or change the location
      const { confirmedPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'confirmedPath',
          message: 'Where should the config file be created?',
          default: suggestedPath,
          validate: (input: any) => {
            if (!input || input.trim() === '') {
              return 'Path is required';
            }
            // Check if the directory exists
            const dir = input.endsWith('.ts') || input.endsWith('.js') ? dirname(input) : input;
            const resolvedDir = resolve(process.cwd(), dir);
            if (!existsSync(resolvedDir)) {
              return `Directory does not exist: ${resolvedDir}`;
            }
            return true;
          },
        },
      ]);

      const resolvedPath = resolve(process.cwd(), confirmedPath);
      configPath =
        confirmedPath.endsWith('.ts') || confirmedPath.endsWith('.js')
          ? resolvedPath
          : join(resolvedPath, 'inkeep.config.ts');
    }
  }

  // Check if config file already exists
  if (existsSync(configPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `${basename(configPath)} already exists at this location. Do you want to overwrite it?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Init cancelled.'));
      return;
    }
  }

  // Prompt for configuration values
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'tenantId',
      message: 'Enter your tenant ID:',
      validate: (input: any) => {
        if (!input || input.trim() === '') {
          return 'Tenant ID is required';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'projectId',
      message: 'Enter your project ID:',
      default: 'default',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Project ID is required';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'apiUrl',
      message: 'Enter the API URL:',
      default: 'http://localhost:3002',
      validate: (input: any) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      },
    },
  ]);

  // Model configuration prompts
  const { modelSettings } = await promptForModelConfiguration();

  // Generate the config file content
  const configContent = `import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: '${answers.tenantId}',
  projectId: '${answers.projectId}',
  agentsManageApiUrl: '${answers.apiUrl}',
  agentsRunApiUrl: '${answers.apiUrl}',
  modelSettings: ${JSON.stringify(modelSettings, null, 2)},
});
`;

  // Write the config file
  try {
    writeFileSync(configPath, configContent);
    console.log(chalk.green('✓'), `Created ${chalk.cyan(configPath)}`);
    console.log(chalk.gray('\nYou can now use the Inkeep CLI commands.'));
    console.log(chalk.gray('For example: inkeep list-graphs'));

    // If the config is not in the current directory, provide a hint
    const configDir = dirname(configPath);
    if (configDir !== process.cwd()) {
      console.log(chalk.gray(`\nNote: Config file created in ${configDir}`));
      console.log(
        chalk.gray(`Use --config ${configPath} with commands, or run commands from that directory.`)
      );
    }
  } catch (error) {
    console.error(chalk.red('Failed to create config file:'), error);
    process.exit(1);
  }
}
