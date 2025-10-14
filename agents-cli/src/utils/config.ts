import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { getLogger } from '@inkeep/agents-core';
import { importWithTypeScriptSupport } from './tsx-loader';

const logger = getLogger('config');

/**
 * Masks sensitive values in config for safe logging
 * @internal Exported for testing purposes
 */
export function maskSensitiveConfig(config: any): any {
  if (!config) return config;

  const masked = { ...config };

  // Mask API keys - show last 4 characters only
  if (masked.agentsManageApiKey) {
    masked.agentsManageApiKey = `***${masked.agentsManageApiKey.slice(-4)}`;
  }
  if (masked.agentsRunApiKey) {
    masked.agentsRunApiKey = `***${masked.agentsRunApiKey.slice(-4)}`;
  }

  return masked;
}

// Internal normalized configuration (supports both formats)
export interface InkeepConfig {
  tenantId?: string;
  agentsManageApiUrl?: string;
  agentsRunApiUrl?: string;
  agentsManageApiKey?: string;
  agentsRunApiKey?: string;
  manageUiUrl?: string;
  outputDirectory?: string;
}

export interface ValidatedConfiguration {
  tenantId: string;
  agentsManageApiUrl: string;
  agentsRunApiUrl: string;
  agentsManageApiKey?: string;
  agentsRunApiKey?: string;
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
 * Type guard to check if config uses nested format
 */
function isNestedConfig(config: any): config is {
  tenantId?: string;
  agentsManageApi?: { url?: string; apiKey?: string };
  agentsRunApi?: { url?: string; apiKey?: string };
  manageUiUrl?: string;
  outputDirectory?: string;
} {
  return config && (config.agentsManageApi !== undefined || config.agentsRunApi !== undefined);
}

/**
 * Normalize config from either flat or nested format to internal format
 */
function normalizeConfig(config: any): InkeepConfig {
  if (isNestedConfig(config)) {
    // New nested format
    return {
      tenantId: config.tenantId,
      agentsManageApiUrl: config.agentsManageApi?.url,
      agentsRunApiUrl: config.agentsRunApi?.url,
      agentsManageApiKey: config.agentsManageApi?.apiKey,
      agentsRunApiKey: config.agentsRunApi?.apiKey,
      manageUiUrl: config.manageUiUrl,
      outputDirectory: config.outputDirectory,
    };
  } else {
    // Legacy flat format
    return {
      tenantId: config.tenantId,
      agentsManageApiUrl: config.agentsManageApiUrl,
      agentsRunApiUrl: config.agentsRunApiUrl,
      manageUiUrl: config.manageUiUrl,
      outputDirectory: config.outputDirectory,
    };
  }
}

/**
 * Search for config file in current directory and parent directories
 * @param startPath - Directory to start searching from (defaults to current working directory)
 * @returns Path to config file or null if not found
 */
export function findConfigFile(startPath: string = process.cwd()): string | null {
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

/**
 * Load config file from disk and normalize it
 * This is the core config loading logic used by all CLI commands
 *
 * @param configPath - Optional explicit path to config file
 * @returns Normalized config or null if not found
 */
export async function loadConfigFromFile(configPath?: string): Promise<InkeepConfig | null> {
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

    // Support both default export and named export (matching pull.ts pattern)
    const rawConfig = module.default || module.config;

    if (!rawConfig) {
      throw new Error(`No config exported from ${resolvedPath}`);
    }

    // Normalize config to internal format (handles both flat and nested)
    const config = normalizeConfig(rawConfig);

    logger.info({ config: maskSensitiveConfig(config) }, `Loaded config values`);

    return config;
  } catch (error) {
    console.warn(`Warning: Failed to load config file ${resolvedPath}:`, error);
    return null;
  }
}

/**
 * Main config loader - single source of truth for loading inkeep.config.ts
 * This is the ONLY function that should be used to load configuration across all CLI commands.
 *
 * Configuration priority (highest to lowest):
 * 1. CLI flags (handled by caller)
 * 2. Config file (inkeep.config.ts)
 * 3. Default values
 *
 * @param configPath - Optional explicit path to config file
 * @returns Normalized configuration with defaults applied
 */
export async function loadConfig(configPath?: string): Promise<InkeepConfig> {
  // IMPORTANT: URL configuration (agentsManageApiUrl, agentsRunApiUrl) is loaded ONLY from
  // the config file or CLI flags, NOT from environment variables or .env files.
  //
  // Note: .env files ARE loaded by env.ts for secrets (API keys, bypass tokens), but those
  // environment variables are NOT used for URL configuration to ensure explicit control.

  // 1. Start with default config (lowest priority)
  const config: InkeepConfig = {
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3003',
    manageUiUrl: 'http://localhost:3000',
  };

  // 2. Override with file config (higher priority)
  // Only override defined values, keep defaults for undefined values
  const fileConfig = await loadConfigFromFile(configPath);
  if (fileConfig) {
    // Filter out undefined values from fileConfig so they don't override defaults
    Object.keys(fileConfig).forEach((key) => {
      const value = fileConfig[key as keyof InkeepConfig];
      if (value !== undefined) {
        (config as any)[key] = value;
      }
    });
    logger.info({ mergedConfig: maskSensitiveConfig(config) }, `Config loaded from file`);
  } else {
    logger.info(
      { config: maskSensitiveConfig(config) },
      `Using default config (no config file found)`
    );
  }

  return config;
}

/**
 * Validates configuration loaded from inkeep.config.ts file
 * This is the ONLY way to configure the CLI - no CLI flags for URLs/keys
 *
 * Configuration priority:
 * 1. Config file (inkeep.config.ts or --config path/to/config.ts)
 * 2. Default values (http://localhost:3002, http://localhost:3003)
 *
 * Note: API URLs and keys are loaded ONLY from the config file, NOT from environment
 * variables or CLI flags. This ensures explicit control over where the CLI connects.
 *
 * Secrets (API keys, bypass tokens) CAN be loaded from .env files in the working directory
 * and parent directories via the config file's environment variable references.
 *
 * @param configPath - explicit path to config file (from --config parameter)
 * @returns configuration with tenantId, agentsManageApiUrl, agentsRunApiUrl, and source info
 */
export async function validateConfiguration(configPath?: string): Promise<ValidatedConfiguration> {
  // Load config from file with defaults
  const config = await loadConfig(configPath);

  // Determine the config file that was actually used
  const actualConfigFile = configPath || findConfigFile();

  // Validate required fields
  if (!config.tenantId) {
    if (actualConfigFile) {
      throw new Error(
        `Tenant ID is missing from configuration file: ${actualConfigFile}\n` +
          'Please ensure your config file exports a valid configuration with tenantId.'
      );
    } else {
      throw new Error(
        'No configuration found. Please:\n' +
          '  1. Create "inkeep.config.ts" by running "inkeep init"\n' +
          '  2. Or provide --config to specify a config file path'
      );
    }
  }

  if (!config.agentsManageApiUrl) {
    throw new Error(
      `Agents Management API URL is missing from config file${actualConfigFile ? `: ${actualConfigFile}` : ''}\n` +
        'Please add agentsManageApiUrl to your configuration file'
    );
  }

  if (!config.agentsRunApiUrl) {
    throw new Error(
      `Agents Run API URL is missing from config file${actualConfigFile ? `: ${actualConfigFile}` : ''}\n` +
        'Please add agentsRunApiUrl to your configuration file'
    );
  }

  // Build sources for debugging
  const sources: any = {
    tenantId: actualConfigFile ? `config file (${actualConfigFile})` : 'default',
    agentsManageApiUrl: actualConfigFile ? `config file (${actualConfigFile})` : 'default value',
    agentsRunApiUrl: actualConfigFile ? `config file (${actualConfigFile})` : 'default value',
  };

  if (actualConfigFile) {
    sources.configFile = actualConfigFile;
  }

  return {
    tenantId: config.tenantId,
    agentsManageApiUrl: config.agentsManageApiUrl,
    agentsRunApiUrl: config.agentsRunApiUrl,
    agentsManageApiKey: config.agentsManageApiKey,
    agentsRunApiKey: config.agentsRunApiKey,
    manageUiUrl: config.manageUiUrl,
    sources,
  };
}
