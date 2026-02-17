import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { getLogger } from '@inkeep/agents-core';
import { loadCredentials } from './credentials';
import { LOCAL_REMOTE } from './profiles';
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
  if (masked.agentsApiKey) {
    masked.agentsApiKey = `***${masked.agentsApiKey.slice(-4)}`;
  }

  return masked;
}

// Internal normalized configuration (supports both formats)
export interface InkeepConfig {
  tenantId?: string;
  agentsApiUrl?: string;
  agentsApiKey?: string;
  manageUiUrl?: string;
  outputDirectory?: string;
}

export interface ValidatedConfiguration {
  tenantId: string;
  agentsApiUrl: string;
  agentsApiKey?: string;
  manageUiUrl?: string;
  outputDirectory?: string;
  sources: {
    tenantId: string;
    agentsApiUrl: string;
    configFile?: string;
  };
}

/**
 * Type guard to check if config uses nested format
 */
function isNestedConfig(config: any): config is {
  tenantId?: string;
  agentsApi?: { url?: string; apiKey?: string };
  manageUiUrl?: string;
  outputDirectory?: string;
} {
  return config && config.agentsApi !== undefined;
}

/**
 * Ensure URL has a scheme so fetch() works. Bare host:port gets http://.
 */
function ensureUrlScheme(url: string | undefined): string | undefined {
  if (!url?.trim()) return url;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `http://${u}`;
}

/**
 * Normalize config from either flat or nested format to internal format
 */
function normalizeConfig(config: any): InkeepConfig {
  if (isNestedConfig(config)) {
    // New nested format
    return {
      tenantId: config.tenantId,
      agentsApiUrl: ensureUrlScheme(config.agentsApi?.url),
      agentsApiKey: config.agentsApi?.apiKey,
      manageUiUrl: config.manageUiUrl,
      outputDirectory: config.outputDirectory,
    };
  }
  // Legacy flat format
  return {
    tenantId: config.tenantId,
    agentsApiUrl: ensureUrlScheme(config.agentsApiUrl),
    manageUiUrl: config.manageUiUrl,
    outputDirectory: config.outputDirectory,
  };
}

/**
 * Get config file names for a given tag
 * @param tag - Optional tag for environment-specific config (e.g., 'prod', 'staging')
 * @returns Array of config file names to search for
 */
export function getConfigFileNames(tag?: string): string[] {
  if (tag) {
    // Tag-based config files: <tag>.__inkeep.config.ts__
    return [`${tag}.__inkeep.config.ts__`, `${tag}.__inkeep.config.js__`];
  }
  // Default config file names
  return ['inkeep.config.ts', 'inkeep.config.js', '.inkeeprc.ts', '.inkeeprc.js'];
}

/**
 * Search for config file in current directory and parent directories
 * @param startPath - Directory to start searching from (defaults to current working directory)
 * @param tag - Optional tag for environment-specific config (e.g., 'prod', 'staging')
 * @returns Path to config file or null if not found
 */
export function findConfigFile(startPath: string = process.cwd(), tag?: string): string | null {
  let currentPath = resolve(startPath);
  const root = '/';

  const configNames = getConfigFileNames(tag);

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
 * Result of finding a project config file
 */
export interface ProjectConfigResult {
  /** Absolute path to the config file */
  configPath: string;
  /** Directory containing the config file (project root) */
  projectDir: string;
  /** Project ID extracted from the config */
  projectId: string | null;
}

/**
 * Find all project config files recursively in a directory
 * @param rootDir - Root directory to search
 * @param tag - Optional tag for environment-specific config
 * @param excludeDirs - Directories to exclude from search
 * @returns Array of found config file paths
 */
export function findAllConfigFiles(
  rootDir: string,
  tag?: string,
  excludeDirs: string[] = ['node_modules', '.git', 'dist', 'build', '.temp-validation']
): string[] {
  const configFiles: string[] = [];
  const configNames = getConfigFileNames(tag);

  function scanDirectory(dir: string): void {
    if (!existsSync(dir)) {
      return;
    }

    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return; // Skip directories we can't read
    }

    for (const item of items) {
      const fullPath = join(dir, item);
      const relativePath = relative(rootDir, fullPath);

      // Skip excluded directories
      if (excludeDirs.some((excl) => item === excl || relativePath.startsWith(`${excl}/`))) {
        continue;
      }

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (stat.isFile() && configNames.includes(item)) {
          configFiles.push(fullPath);
        }
      } catch {
        // Skip files/directories we can't stat
      }
    }
  }

  scanDirectory(rootDir);
  return configFiles.sort();
}

/**
 * Extract project ID from a loaded config
 * The project ID can be specified directly or needs to be loaded from the project
 * @param configPath - Path to the config file
 * @returns Project ID or null if not found
 */
export async function extractProjectIdFromConfig(configPath: string): Promise<string | null> {
  try {
    const module = await importWithTypeScriptSupport(configPath);
    const rawConfig = module.default || module.config;

    if (!rawConfig) {
      return null;
    }

    // Check if projectId is directly in config
    if (rawConfig.projectId) {
      return rawConfig.projectId;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find project config and extract project information
 * This walks up directories to find the nearest config file
 * @param startPath - Directory to start searching from
 * @param tag - Optional tag for environment-specific config
 * @returns Project config result or null if not found
 */
export async function findProjectConfig(
  startPath: string = process.cwd(),
  tag?: string
): Promise<ProjectConfigResult | null> {
  const configPath = findConfigFile(startPath, tag);

  if (!configPath) {
    return null;
  }

  const projectDir = dirname(configPath);
  const projectId = await extractProjectIdFromConfig(configPath);

  return {
    configPath,
    projectDir,
    projectId,
  };
}

/**
 * Load config file from disk and normalize it
 * This is the core config loading logic used by all CLI commands
 *
 * @param configPath - Optional explicit path to config file
 * @param tag - Optional tag for environment-specific config (e.g., 'prod', 'staging')
 * @returns Normalized config or null if not found
 */
export async function loadConfigFromFile(
  configPath?: string,
  tag?: string
): Promise<InkeepConfig | null> {
  logger.info({ fromPath: configPath, tag }, `Loading config file`);

  let resolvedPath: string | null;

  if (configPath) {
    // User specified a config path
    resolvedPath = resolve(process.cwd(), configPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }
  } else {
    // Search for config file (with optional tag)
    resolvedPath = findConfigFile(process.cwd(), tag);
    if (!resolvedPath) {
      // No config file found
      if (tag) {
        // Provide helpful error for missing tagged config
        const taggedFileName = getConfigFileNames(tag)[0];
        throw new Error(
          `Tagged config file not found: ${taggedFileName}\n` +
            `Create this file or use a different --tag value.`
        );
      }
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
    if (error instanceof Error && error.message.includes('Tagged config file not found')) {
      throw error;
    }
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
 * @param tag - Optional tag for environment-specific config (e.g., 'prod', 'staging')
 * @returns Normalized configuration with defaults applied
 */
export async function loadConfig(configPath?: string, tag?: string): Promise<InkeepConfig> {
  // IMPORTANT: URL configuration (agentsApiUrl) is loaded ONLY from
  // the config file or CLI flags, NOT from environment variables or .env files.
  //
  // Note: .env files ARE loaded by env.ts for secrets (API keys, bypass tokens), but those
  // environment variables are NOT used for URL configuration to ensure explicit control.

  // 1. Start with default config (lowest priority)
  const config: InkeepConfig = {
    agentsApiUrl: LOCAL_REMOTE.api,
    manageUiUrl: LOCAL_REMOTE.manageUi,
  };

  // 2. Override with file config (higher priority)
  // Only override defined values, keep defaults for undefined values
  const fileConfig = await loadConfigFromFile(configPath, tag);
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
 * 2. CLI credentials (from `inkeep login`) - for API key and tenant ID fallback
 * 3. Default values (http://localhost:3002)
 *
 * Note: API URLs and keys are loaded ONLY from the config file, NOT from environment
 * variables or CLI flags. This ensures explicit control over where the CLI connects.
 *
 * Secrets (API keys, bypass tokens) CAN be loaded from .env files in the working directory
 * and parent directories via the config file's environment variable references.
 *
 * @param configPath - explicit path to config file (from --config parameter)
 * @param tag - optional tag for environment-specific config (e.g., 'prod', 'staging')
 * @returns configuration with tenantId, agentsApiUrl, and source info
 */
export async function validateConfiguration(
  configPath?: string,
  tag?: string
): Promise<ValidatedConfiguration> {
  // Load config from file with defaults
  const config = await loadConfig(configPath, tag);

  // Determine the config file that was actually used
  const actualConfigFile = configPath || findConfigFile(process.cwd(), tag);

  // Load CLI credentials as fallback for API key and tenant ID
  // Skip keychain access in CI to avoid hanging on unavailable keychain services
  let cliCredentials: { accessToken: string; organizationId: string } | null = null;
  const isCI = process.env.CI === 'true' || process.env.CI === '1' || !!process.env.GITHUB_ACTIONS;
  if (!isCI) {
    try {
      const credentials = await loadCredentials();
      if (credentials?.accessToken && credentials.organizationId) {
        cliCredentials = {
          accessToken: credentials.accessToken,
          organizationId: credentials.organizationId,
        };
        logger.info({}, 'CLI credentials available for fallback');
      }
    } catch {
      // Ignore errors loading credentials - keychain might not be available
      logger.debug({}, 'Could not load CLI credentials');
    }
  } else {
    logger.debug({}, 'Skipping keychain credential loading in CI environment');
  }

  // Use CLI credentials as fallback for API key if not specified in config
  if (!config.agentsApiKey && cliCredentials) {
    config.agentsApiKey = cliCredentials.accessToken;
    logger.info({}, 'Using CLI session token as API key');
  }
  // Login stores under 'inkeep-cloud'; default loadCredentials() uses 'auth-credentials'
  if (!config.agentsApiKey && !cliCredentials) {
    const cloudCreds = await loadCredentials('inkeep-cloud');
    if (cloudCreds?.accessToken) {
      config.agentsApiKey = cloudCreds.accessToken;
      if (!config.tenantId) config.tenantId = cloudCreds.organizationId;
      logger.info({}, 'Using CLI login credentials (inkeep-cloud)');
    }
  }

  // Use CLI credentials as fallback for tenant ID if not specified in config
  if (!config.tenantId && cliCredentials) {
    config.tenantId = cliCredentials.organizationId;
    logger.info({}, 'Using CLI organization ID as tenant ID');
  }

  // Validate required fields
  if (!config.tenantId) {
    if (actualConfigFile) {
      throw new Error(
        `Tenant ID is missing from configuration file: ${actualConfigFile}\n` +
          'Please ensure your config file exports a valid configuration with tenantId,\n' +
          'or run "inkeep login" to authenticate with Inkeep Cloud.'
      );
    }
    throw new Error(
      'No configuration found. Please:\n' +
        '  1. Run "inkeep login" to authenticate with Inkeep Cloud\n' +
        '  2. Or create "inkeep.config.ts" by running "inkeep init"\n' +
        '  3. Or provide --config to specify a config file path'
    );
  }

  if (!config.agentsApiUrl) {
    throw new Error(
      `Agents API URL is missing from config file${actualConfigFile ? `: ${actualConfigFile}` : ''}\n` +
        'Please add agentsApiUrl to your configuration file'
    );
  }

  // Build sources for debugging
  const sources: any = {
    tenantId:
      cliCredentials && !actualConfigFile
        ? 'CLI login (organization ID)'
        : actualConfigFile
          ? `config file (${actualConfigFile})`
          : 'default',
    agentsApiUrl: actualConfigFile ? `config file (${actualConfigFile})` : 'default value',
  };

  if (actualConfigFile) {
    sources.configFile = actualConfigFile;
  }

  return {
    tenantId: config.tenantId,
    agentsApiUrl: config.agentsApiUrl,
    agentsApiKey: config.agentsApiKey,
    manageUiUrl: config.manageUiUrl,
    sources,
  };
}
