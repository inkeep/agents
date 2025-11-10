import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';

export interface InitOptions {
  path?: string;
  config?: string;
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
      const confirmedPath = await p.text({
        message: 'Where should the config file be created?',
        defaultValue: suggestedPath,
        validate: (input) => {
          if (!input || input.trim() === '') {
            return 'Path is required';
          }
          // Check if the directory exists
          const dir = input.endsWith('.ts') || input.endsWith('.js') ? dirname(input) : input;
          const resolvedDir = resolve(process.cwd(), dir);
          if (!existsSync(resolvedDir)) {
            return `Directory does not exist: ${resolvedDir}`;
          }
          return undefined;
        },
      });

      if (p.isCancel(confirmedPath)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }

      const resolvedPath = resolve(process.cwd(), confirmedPath);
      configPath =
        confirmedPath.endsWith('.ts') || confirmedPath.endsWith('.js')
          ? resolvedPath
          : join(resolvedPath, 'inkeep.config.ts');
    }
  }

  // Check if config file already exists
  if (existsSync(configPath)) {
    const overwrite = await p.confirm({
      message: `${basename(configPath)} already exists at this location. Do you want to overwrite it?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    if (!overwrite) {
      console.log(chalk.yellow('Init cancelled.'));
      return;
    }
  }

  // Prompt for configuration values
  const tenantId = await p.text({
    message: 'Enter your tenant ID:',
    validate: (input) => {
      if (!input || input.trim() === '') {
        return 'Tenant ID is required';
      }
      return undefined;
    },
  });

  if (p.isCancel(tenantId)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const validateUrl = (input: string) => {
    try {
      if (input && input.trim() !== '') {
        new URL(input);
        return undefined;
      }
      return undefined;
    } catch {
      return 'Please enter a valid URL';
    }
  };

  const manageApiUrl = await p.text({
    message: 'Enter the Management API URL:',
    placeholder: 'http://localhost:3002',
    defaultValue: 'http://localhost:3002',
    validate: validateUrl,
  });

  if (p.isCancel(manageApiUrl)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  const runApiUrl = await p.text({
    message: 'Enter the Run API URL:',
    placeholder: 'http://localhost:3003',
    defaultValue: 'http://localhost:3003',
    validate: validateUrl,
  });

  if (p.isCancel(runApiUrl)) {
    p.cancel('Operation cancelled');
    process.exit(0);
  }

  // Generate the config file content
  const configContent = `import { defineConfig } from '@inkeep/agents-cli/config';

export default defineConfig({
  tenantId: '${tenantId}',
  agentsManageApi: {
    url: '${manageApiUrl}',
  },
  agentsRunApi: {
    url: '${runApiUrl}',
  },
});
`;

  // Write the config file
  try {
    writeFileSync(configPath, configContent);
    console.log(chalk.green('✓'), `Created ${chalk.cyan(configPath)}`);
    console.log(chalk.gray('\nYou can now use the Inkeep CLI commands.'));
    console.log(chalk.gray('For example: inkeep list-agent'));

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
