import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ModelSettings } from '@inkeep/agents-core';
import dotenv from 'dotenv';
import { importWithTypeScriptSupport } from './tsx-loader';

// Load .env file from current directory if it exists
dotenv.config({ quiet: true });

export interface InkeepConfig {
  tenantId?: string;
  projectId?: string;
  agentsManageApiUrl?: string;
  agentsRunApiUrl?: string;
  manageUiUrl?: string;
  outputDirectory?: string;
  modelSettings?: ModelSettings;
}

export interface ValidatedConfiguration {
  tenantId: string;
  projectId: string;
  agentsManageApiUrl: string;
  agentsRunApiUrl: string;
  manageUiUrl?: string;
  outputDirectory?: string;
  modelSettings?: ModelSettings;
  sources: {
    tenantId: string;
    projectId: string;
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
  // Default config
  const config: InkeepConfig = {
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3003',
    manageUiUrl: 'http://localhost:3000',
  };

  // Try to load from inkeep.config.ts or specified config file
  const fileConfig = await loadConfigFromFile(configPath);
  if (fileConfig) {
    Object.assign(config, fileConfig);
  }

  // Override with environment variables if present
  if (process.env.INKEEP_AGENTS_MANAGE_API_URL) {
    config.agentsManageApiUrl = process.env.INKEEP_AGENTS_MANAGE_API_URL;
  }
  if (process.env.INKEEP_AGENTS_RUN_API_URL) {
    config.agentsRunApiUrl = process.env.INKEEP_AGENTS_RUN_API_URL;
  }

  return config;
}

export async function getTenantId(configPath?: string): Promise<string | undefined> {
  const config = await loadConfig(configPath);
  return config.tenantId;
}

export async function getProjectId(configPath?: string): Promise<string> {
  const config = await loadConfig(configPath);
  return config.projectId || 'default';
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
 * Validates configuration according to these rules:
 * 1. If --config-file-path is provided, use it (cannot be combined with --tenant-id)
 * 2. If --tenant-id AND --agents-manage-api-url AND --agents-run-api-url are provided, use them (cannot be combined with --config-file-path)
 * 3. If only --agents-manage-api-url and --agents-run-api-url are provided, it overrides the agentsManageApiUrl and agentsRunApiUrl from default config
 * 4. Otherwise, look for default config file (inkeep.config.ts)
 *
 * @param tenantIdFlag - tenantId from command line flag
 * @param agentsManageApiUrlFlag - agentsManageApiUrl from command line flag
 * @param agentsRunApiUrlFlag - agentsRunApiUrl from command line flag
 * @param configFilePath - explicit path to config file
 * @returns configuration with tenantId, agentsManageApiUrl, and sources used
 */
export async function validateConfiguration(
  tenantIdFlag?: string,
  agentsManageApiUrlFlag?: string,
  agentsRunApiUrlFlag?: string,
  configFilePath?: string
): Promise<ValidatedConfiguration> {
  // Validation: Cannot combine --config-file-path with --tenant-id
  if (configFilePath && tenantIdFlag) {
    throw new Error(
      'Invalid configuration combination:\n' +
        'Cannot use --config-file-path with --tenant-id.\n' +
        'Please use either:\n' +
        '  1. --config-file-path alone\n' +
        '  2. --tenant-id with --agents-manage-api-url and --agents-run-api-url\n' +
        '  3. Default config file (inkeep.config.ts)'
    );
  }

  // Case 1: Explicit config file path provided
  if (configFilePath) {
    const config = await loadConfig(configFilePath);
    const tenantId = config.tenantId;
    const projectId = config.projectId || 'default';
    const agentsManageApiUrl = agentsManageApiUrlFlag || config.agentsManageApiUrl; // Allow ---agents-manage-api-url to override
    const agentsRunApiUrl = agentsRunApiUrlFlag || config.agentsRunApiUrl; // Allow --agents-run-api-url to override

    if (!tenantId) {
      throw new Error(
        `Tenant ID is missing from configuration file: ${configFilePath}\n` +
          'Please ensure your config file exports a valid configuration with tenantId.'
      );
    }

    if (!agentsManageApiUrl) {
      throw new Error(
        `Agents Manage API URL is missing from configuration file: ${configFilePath}\n` +
          'Please ensure your config file exports a valid configuration with agentsManageApiUrl.'
      );
    }
    if (!agentsRunApiUrl) {
      throw new Error(
        `Agents Run API URL is missing from configuration file: ${configFilePath}\n` +
          'Please ensure your config file exports a valid configuration with agentsRunApiUrl.'
      );
    }

    const sources = {
      tenantId: `config file (${configFilePath})`,
      projectId: config.projectId ? `config file (${configFilePath})` : 'default',
      agentsManageApiUrl: agentsManageApiUrlFlag
        ? 'command-line flag (--agents-manage-api-url)'
        : `config file (${configFilePath})`,
      agentsRunApiUrl: agentsRunApiUrlFlag
        ? 'command-line flag (--agents-run-api-url)'
        : `config file (${configFilePath})`,
      configFile: configFilePath,
    };

    return {
      tenantId,
      projectId,
      agentsManageApiUrl,
      agentsRunApiUrl,
      manageUiUrl: config.manageUiUrl,
      modelSettings: config.modelSettings || undefined,
      sources,
    };
  }

  // Case 2: Both --tenant-id and --agents-manage-api-url and --agents-run-api-url provided
  if (tenantIdFlag && agentsManageApiUrlFlag && agentsRunApiUrlFlag) {
    const sources = {
      tenantId: 'command-line flag (--tenant-id)',
      projectId: 'default',
      agentsManageApiUrl: 'command-line flag (--agents-manage-api-url)',
      agentsRunApiUrl: 'command-line flag (--agents-run-api-url)',
    };
    return {
      tenantId: tenantIdFlag,
      projectId: 'default',
      agentsManageApiUrl: agentsManageApiUrlFlag,
      agentsRunApiUrl: agentsRunApiUrlFlag,
      manageUiUrl: undefined,
      modelSettings: undefined,
      sources,
    };
  }

  // Case 3: Only --tenant-id provided (invalid)
  if (tenantIdFlag && !agentsManageApiUrlFlag && !agentsRunApiUrlFlag) {
    throw new Error(
      'Invalid configuration:\n' +
        '--tenant-id requires --agents-manage-api-url and --agents-run-api-url to be provided as well.\n' +
        'Please provide both --tenant-id and --agents-manage-api-url and --agents-run-api-url together.'
    );
  }

  // Case 4: Try to load from default config file
  const config = await loadConfig();
  const tenantId = config.tenantId;
  const projectId = config.projectId || 'default';
  const agentsManageApiUrl = agentsManageApiUrlFlag || config.agentsManageApiUrl; // Allow --agents-manage-api-url to override
  const agentsRunApiUrl = agentsRunApiUrlFlag || config.agentsRunApiUrl; // Allow --agents-run-api-url to override

  if (!tenantId) {
    // Check if a default config file exists
    const configFile = findConfigFile();
    if (!configFile) {
      throw new Error(
        'No configuration found. Please use one of:\n' +
          '  1. Create "inkeep.config.ts" by running "inkeep init"\n' +
          '  2. Provide --config-file-path to specify a config file\n' +
          '  3. Provide both --tenant-id and --agents-manage-api-url and --agents-run-api-url flags\n' +
          '  4. Set INKEEP_AGENTS_MANAGE_API_URL and INKEEP_AGENTS_RUN_API_URL environment variables'
      );
    } else {
      throw new Error(
        `Tenant ID is missing from configuration file: ${configFile}\n` +
          'Please either:\n' +
          '  1. Update your configuration file with a tenantId\n' +
          '  2. Provide both --tenant-id and --agents-manage-api-url and --agents-run-api-url flags\n'
      );
    }
  }

  if (!agentsManageApiUrl) {
    throw new Error(
      'Agents Management API URL is missing. Please either:\n' +
        '  1. Provide --agents-manage-api-url flag\n' +
        '  2. Set INKEEP_AGENTS_MANAGE_API_URL environment variable\n' +
        '  3. Add agentsManageApiUrl to your configuration file'
    );
  }

  if (!agentsRunApiUrl) {
    throw new Error(
      'Agents Run API URL is missing. Please either:\n' +
        '  1. Provide --agents-run-api-url flag\n' +
        '  2. Set INKEEP_AGENTS_RUN_API_URL environment variable\n' +
        '  3. Add agentsRunApiUrl to your configuration file'
    );
  }

  // Determine sources for Case 4
  const configFile = findConfigFile();
  let agentsManageApiUrlSource = configFile ? `config file (${configFile})` : 'default';
  let agentsRunApiUrlSource = configFile ? `config file (${configFile})` : 'default';

  if (agentsManageApiUrlFlag) {
    agentsManageApiUrlSource = 'command-line flag (--agents-manage-api-url)';
  } else if (process.env.INKEEP_AGENTS_MANAGE_API_URL === agentsManageApiUrl) {
    agentsManageApiUrlSource = 'environment variable (INKEEP_AGENTS_MANAGE_API_URL)';
  } else if (agentsManageApiUrl === 'http://localhost:3002' && !configFile) {
    agentsManageApiUrlSource = 'default value';
  }
  if (agentsRunApiUrlFlag) {
    agentsRunApiUrlSource = 'command-line flag (--agents-run-api-url)';
  } else if (process.env.INKEEP_AGENTS_RUN_API_URL === agentsRunApiUrl) {
    agentsRunApiUrlSource = 'environment variable (INKEEP_AGENTS_RUN_API_URL)';
  } else if (agentsRunApiUrl === 'http://localhost:3003' && !configFile) {
    agentsRunApiUrlSource = 'default value';
  }

  const sources = {
    tenantId: `config file (${configFile})`,
    projectId: config.projectId
      ? configFile
        ? `config file (${configFile})`
        : 'config'
      : 'default',
    agentsManageApiUrl: agentsManageApiUrlSource,
    agentsRunApiUrl: agentsRunApiUrlSource,
    configFile: configFile || undefined,
  };

  return {
    tenantId,
    projectId,
    agentsManageApiUrl,
    agentsRunApiUrl,
    manageUiUrl: config.manageUiUrl,
    modelSettings: config.modelSettings || undefined,
    sources,
  };
}
