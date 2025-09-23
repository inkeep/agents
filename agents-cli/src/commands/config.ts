import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

export interface ConfigOptions {
  config?: string;
  configFilePath?: string; // deprecated, kept for backward compatibility
}

export async function configGetCommand(key?: string, options?: ConfigOptions) {
  // Use new config parameter, fall back to configFilePath for backward compatibility
  const configPath = options?.config || options?.configFilePath || join(process.cwd(), 'inkeep.config.ts');

  if (!existsSync(configPath)) {
    console.error(chalk.red('No configuration file found.'));
    console.log(
      chalk.gray(
        'Run "inkeep init" to create one, or specify a config file with --config'
      )
    );
    process.exit(1);
  }

  try {
    const content = readFileSync(configPath, 'utf-8');

    // Parse the config file to extract values
    const tenantIdMatch = content.match(/tenantId:\s*['"]([^'"]+)['"]/);
    const apiUrlMatch = content.match(/apiUrl:\s*['"]([^'"]+)['"]/);

    const config = {
      tenantId: tenantIdMatch ? tenantIdMatch[1] : undefined,
      apiUrl: apiUrlMatch ? apiUrlMatch[1] : undefined,
    };

    if (key) {
      // Get specific key
      const value = config[key as keyof typeof config];
      if (value !== undefined) {
        console.log(value);
      } else {
        console.error(chalk.red(`Unknown configuration key: ${key}`));
        console.log(chalk.gray('Available keys: tenantId, apiUrl'));
        process.exit(1);
      }
    } else {
      // Display all config
      console.log(chalk.cyan('Current configuration:'));
      console.log(chalk.gray('  Config file:'), configPath);
      console.log(chalk.gray('  Tenant ID:'), config.tenantId || chalk.yellow('(not set)'));
      console.log(chalk.gray('  API URL:'), config.apiUrl || chalk.yellow('(not set)'));
    }
  } catch (error) {
    console.error(chalk.red('Failed to read configuration:'), error);
    process.exit(1);
  }
}

export async function configSetCommand(key: string, value: string, options?: ConfigOptions) {
  // Use new config parameter, fall back to configFilePath for backward compatibility
  const configPath = options?.config || options?.configFilePath || join(process.cwd(), 'inkeep.config.ts');

  // Validate the key
  if (!['tenantId', 'apiUrl'].includes(key)) {
    console.error(chalk.red(`Invalid configuration key: ${key}`));
    console.log(chalk.gray('Available keys: tenantId, apiUrl'));
    process.exit(1);
  }

  // Validate apiUrl if setting it
  if (key === 'apiUrl') {
    try {
      new URL(value);
    } catch {
      console.error(chalk.red('Invalid URL format'));
      process.exit(1);
    }
  }

  if (!existsSync(configPath)) {
    // Create a new config file if it doesn't exist
    const configContent = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: '${key === 'tenantId' ? value : ''}',
    apiUrl: '${key === 'apiUrl' ? value : 'http://localhost:3002'}',
});
`;

    try {
      writeFileSync(configPath, configContent);
      console.log(chalk.green('✓'), `Created config file and set ${key} to:`, chalk.cyan(value));
    } catch (error) {
      console.error(chalk.red('Failed to create config file:'), error);
      process.exit(1);
    }
  } else {
    // Update existing config file
    try {
      let content = readFileSync(configPath, 'utf-8');

      if (key === 'tenantId') {
        // Update or add tenantId
        if (content.includes('tenantId:')) {
          content = content.replace(/tenantId:\s*['"][^'"]*['"]/, `tenantId: '${value}'`);
        } else {
          // Add tenantId to the config object
          content = content.replace(
            /defineConfig\s*\(\s*{/,
            `defineConfig({\n    tenantId: '${value}',`
          );
        }
      } else if (key === 'apiUrl') {
        // Update or add apiUrl
        if (content.includes('apiUrl:')) {
          content = content.replace(/apiUrl:\s*['"][^'"]*['"]/, `apiUrl: '${value}'`);
        } else {
          // Add apiUrl to the config object
          content = content.replace(
            /defineConfig\s*\(\s*{/,
            `defineConfig({\n    apiUrl: '${value}',`
          );
        }
      }

      writeFileSync(configPath, content);
      console.log(chalk.green('✓'), `Updated ${key} to:`, chalk.cyan(value));
    } catch (error) {
      console.error(chalk.red('Failed to update config file:'), error);
      process.exit(1);
    }
  }
}

export async function configListCommand(options?: ConfigOptions) {
  // Alias for configGetCommand without a key
  await configGetCommand(undefined, options);
}
