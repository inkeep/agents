import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { getLogger } from '@inkeep/agents-core';
import { importWithTypeScriptSupport } from './tsx-loader';

const logger = getLogger('config');

export interface InkeepConfig {
  tenantId?: string;
  agentsManageApiUrl?: string;
  agentsRunApiUrl?: string;
  manageUiUrl?: string;
  outputDirectory?: string;
}

export interface ValidatedConfiguration {
  tenantId: string;
  agentsManageApiUrl: string;
  agentsRunApiUrl: string;
  manageUiUrl?: string;
  outputDirectory?: string;
  sources: {
    tenantId: string;
    agentsManageApiUrl: string;
    agentsRunApiUrl: string;
    configFile?: string;
  };
}

/**
 * Search for config file in current directory and parent directories
 */
function findConfigFile(startPath: string = process.cwd()): string | null {
  let currentPath = resolve(startPath);
  const root = '/';

  const configNames = ['inkeep.config.ts', 'inkeep.config.js', '.inkeeprc.ts', '.inkeeprc.js'];

  while (currentPath !== root) {
    // Check for config files at this level
    for (const configName of configNames) {
      const configPath = join(currentPath, configName);
      if (existsSync(configPath)) {
        return configPath;
      }
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      break; // Reached filesystem root
    }
    currentPath = parentPath;
  }

  return null;
}

async function loadConfigFromFile(configPath?: string): Promise<InkeepConfig | null> {
  logger.info({ fromPath: configPath }, `Loading config file`);

  let resolvedPath: string | null;

  if (configPath) {
    // User specified a config path
    resolvedPath = resolve(process.cwd(), configPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }
  } else {
    // Search for config file
    resolvedPath = findConfigFile();
    if (!resolvedPath) {
      // No config file found
      return null;
    }
  }

  try {
    const module = await importWithTypeScriptSupport(resolvedPath);

    // Support both default export and named export
    const config = module.default || module.config;

    logger.info({ config }, `Loaded config values`);

    if (!config) {
      throw new Error(`No config exported from ${resolvedPath}`);
    }

    return config;
  } catch (error) {
    console.warn(`Warning: Failed to load config file ${resolvedPath}:`, error);
    return null;
  }
}

export async function loadConfig(configPath?: string): Promise<InkeepConfig> {
  // Configuration priority for CLI (highest to lowest):
  // 1. CLI flags (handled in validateConfiguration)
  // 2. Config file (inkeep.config.ts)
  // 3. Default values
  //
  // IMPORTANT: URL configuration (agentsManageApiUrl, agentsRunApiUrl) is loaded ONLY from
  // the config file or CLI flags, NOT from environment variables or .env files.
  //
  // Note: .env files ARE loaded by env.ts for secrets (API keys, bypass tokens), but those
  // environment variables are NOT used for URL configuration to ensure explicit control.

  // 1. Start with default config (lowest priority)
  let config: InkeepConfig = {
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3003',
    manageUiUrl: 'http://localhost:3000',
  };

  // 2. Override with file config (higher priority)
  const fileConfig = await loadConfigFromFile(configPath);
  if (fileConfig) {
    config = {
      ...config,
      ...fileConfig,
    };
    logger.info({ mergedConfig: config }, `Config loaded from file`);
  } else {
    logger.info({ config }, `Using default config (no config file found)`);
  }

  return config;
}

export async function getTenantId(configPath?: string): Promise<string | undefined> {
  const config = await loadConfig(configPath);
  return config.tenantId;
}

export async function getProjectId(_configPath?: string): Promise<string> {
  // Always return 'default' as projectId is no longer part of the config
  return 'default';
}

export async function getAgentsManageApiUrl(
  overrideUrl?: string,
  configPath?: string
): Promise<string> {
  // Priority: override > config/env > default
  if (overrideUrl) {
    return overrideUrl;
  }

  const config = await loadConfig(configPath);
  return config.agentsManageApiUrl || 'http://localhost:3002';
}

export async function getAgentsRunApiUrl(
  overrideUrl?: string,
  configPath?: string
): Promise<string> {
  // Priority: override > config/env > default
  if (overrideUrl) {
    return overrideUrl;
  }

  const config = await loadConfig(configPath);
  return config.agentsRunApiUrl || 'http://localhost:3003';
}

/**
 * Validates configuration with the following priority hierarchy (highest to lowest):
 * 1. Command-line flags (--tenant-id, --agents-manage-api-url, --agents-run-api-url) - HIGHEST
 * 2. Config file (inkeep.config.ts or --config path/to/config.ts)
 * 3. Default values (http://localhost:3002, http://localhost:3003) - LOWEST
 *
 * Note: URL configuration (agentsManageApiUrl, agentsRunApiUrl) is loaded ONLY from the config
 * file or CLI flags. The CLI deliberately IGNORES these values from environment variables/.env files
 * to ensure explicit control over where the CLI connects.
 *
 * Secrets (API keys, bypass tokens) ARE loaded from .env files in the working directory and parent
 * directories, and are available for the CLI to use when making API calls.
 *
 * @param tenantIdFlag - tenantId from command line flag
 * @param agentsManageApiUrlFlag - agentsManageApiUrl from command line flag
 * @param agentsRunApiUrlFlag - agentsRunApiUrl from command line flag
 * @param configPath - explicit path to config file (from --config parameter)
 * @returns configuration with tenantId, agentsManageApiUrl, agentsRunApiUrl, and sources used
 */
export async function validateConfiguration(
  tenantIdFlag?: string,
  agentsManageApiUrlFlag?: string,
  agentsRunApiUrlFlag?: string,
  configPath?: string
): Promise<ValidatedConfiguration> {
  // Load config from file, which will apply: defaults < file config
  const config = await loadConfig(configPath);

  // Apply CLI flag overrides (highest priority)
  const tenantId = tenantIdFlag || config.tenantId;
  const agentsManageApiUrl = agentsManageApiUrlFlag || config.agentsManageApiUrl;
  const agentsRunApiUrl = agentsRunApiUrlFlag || config.agentsRunApiUrl;

  // Determine the config file that was actually used
  const actualConfigFile = configPath || findConfigFile();

  // Special case: if all required flags are provided, we don't need a config file
  if (tenantIdFlag && agentsManageApiUrlFlag && agentsRunApiUrlFlag) {
    const sources = {
      tenantId: 'command-line flag (--tenant-id)',
      agentsManageApiUrl: 'command-line flag (--agents-manage-api-url)',
      agentsRunApiUrl: 'command-line flag (--agents-run-api-url)',
    };
    return {
      tenantId: tenantIdFlag,
      agentsManageApiUrl: agentsManageApiUrlFlag,
      agentsRunApiUrl: agentsRunApiUrlFlag,
      manageUiUrl: config.manageUiUrl,
      sources,
    };
  }

  // Validate required fields
  if (!tenantId) {
    if (actualConfigFile) {
      throw new Error(
        `Tenant ID is missing from configuration file: ${actualConfigFile}\n` +
          'Please ensure your config file exports a valid configuration with tenantId.'
      );
    } else {
      throw new Error(
        'No configuration found. Please use one of:\n' +
          '  1. Create "inkeep.config.ts" by running "inkeep init"\n' +
          '  2. Provide --config to specify a config file\n' +
          '  3. Provide --tenant-id, --agents-manage-api-url and --agents-run-api-url flags'
      );
    }
  }

  if (!agentsManageApiUrl) {
    throw new Error(
      'Agents Management API URL is missing. Please either:\n' +
        '  1. Provide --agents-manage-api-url flag\n' +
        '  2. Add agentsManageApiUrl to your configuration file'
    );
  }

  if (!agentsRunApiUrl) {
    throw new Error(
      'Agents Run API URL is missing. Please either:\n' +
        '  1. Provide --agents-run-api-url flag\n' +
        '  2. Add agentsRunApiUrl to your configuration file'
    );
  }

  // Build sources for debugging (CLI flags > config file > defaults)
  const sources: any = {
    tenantId: tenantIdFlag
      ? 'command-line flag (--tenant-id)'
      : actualConfigFile
        ? `config file (${actualConfigFile})`
        : 'default',
    agentsManageApiUrl: agentsManageApiUrlFlag
      ? 'command-line flag (--agents-manage-api-url)'
      : actualConfigFile
        ? `config file (${actualConfigFile})`
        : 'default value',
    agentsRunApiUrl: agentsRunApiUrlFlag
      ? 'command-line flag (--agents-run-api-url)'
      : actualConfigFile
        ? `config file (${actualConfigFile})`
        : 'default value',
  };

  if (actualConfigFile) {
    sources.configFile = actualConfigFile;
  }

  return {
    tenantId,
    agentsManageApiUrl,
    agentsRunApiUrl,
    manageUiUrl: config.manageUiUrl,
    sources,
  };
}
