import * as p from '@clack/prompts';
import chalk from 'chalk';
import {
  type CIEnvironmentConfig,
  detectCIEnvironment,
  loadCIEnvironmentConfig,
  logCIConfig,
} from './ci-environment';
import type { ValidatedConfiguration } from './config';
import { validateConfiguration } from './config';
import { getCredentialExpiryInfo, loadCredentials } from './credentials';
import { ProfileManager, type ResolvedProfile } from './profiles';

/**
 * Options for initializing a CLI command
 */
export interface CommandInitOptions {
  /** Path to config file (from --config flag) */
  configPath?: string;
  /** Tag for environment-specific config (e.g., 'prod', 'staging') */
  tag?: string;
  /** Profile name to use (--profile flag) */
  profileName?: string;
  /** Whether to show a spinner during initialization */
  showSpinner?: boolean;
  /** Custom spinner text */
  spinnerText?: string;
  /** Whether to log configuration sources */
  logConfig?: boolean;
  /** Suppress profile logging (--quiet) */
  quiet?: boolean;
}

/**
 * Result from CLI command initialization
 */
export interface CommandInitResult {
  /** Validated configuration */
  config: ValidatedConfiguration;
  /** Resolved profile (if profiles are configured) */
  profile?: ResolvedProfile;
  /** Whether the user is authenticated via profile or CI API key */
  isAuthenticated?: boolean;
  /** Auth token expiry info */
  authExpiry?: string;
  /** Whether running in CI mode */
  isCI?: boolean;
  /** CI configuration (if in CI mode) */
  ciConfig?: CIEnvironmentConfig;
}

/**
 * Standard pipeline for initializing CLI commands
 *
 * This function provides a consistent way to:
 * 1. Load profile configuration (if available)
 * 2. Load and validate configuration from inkeep.config.ts
 * 3. Merge profile config with file config (profile takes precedence)
 * 4. Handle errors with user-friendly messages
 * 5. Optionally display progress with spinners
 * 6. Log configuration sources for debugging
 *
 * Configuration precedence: CLI flag > profile > config.ts defaults
 *
 * @example
 * ```ts
 * export async function myCommand(options: MyOptions) {
 *   const { config, profile, isAuthenticated } = await initializeCommand({
 *     configPath: options.config,
 *     profileName: options.profile,
 *     showSpinner: true,
 *     spinnerText: 'Loading configuration...',
 *     logConfig: true
 *   });
 *
 *   // Your command logic here...
 * }
 * ```
 */
export async function initializeCommand(
  options: CommandInitOptions = {}
): Promise<CommandInitResult> {
  const {
    configPath,
    tag,
    profileName,
    showSpinner = false,
    spinnerText = 'Loading configuration...',
    logConfig = true,
    quiet = false,
  } = options;

  // Start spinner if requested
  const s = showSpinner ? p.spinner() : undefined;
  if (s) {
    s.start(spinnerText);
  }

  try {
    // Check for CI environment first
    const ciDetection = await detectCIEnvironment();
    const ciConfig = ciDetection.isCI ? loadCIEnvironmentConfig() : null;

    // If in CI mode with API key, use CI configuration
    if (ciDetection.isCI && ciConfig) {
      // Load file config as base but override with CI env vars
      const config = await validateConfiguration(configPath, tag);

      // CI env vars take precedence over file config
      if (ciConfig.manageApiUrl) {
        config.agentsManageApiUrl = ciConfig.manageApiUrl;
      }
      if (ciConfig.runApiUrl) {
        config.agentsRunApiUrl = ciConfig.runApiUrl;
      }
      if (ciConfig.apiKey) {
        config.agentsManageApiKey = ciConfig.apiKey;
      }
      if (ciConfig.tenantId) {
        config.tenantId = ciConfig.tenantId;
      }

      if (s) {
        s.stop('Configuration loaded');
      }

      if (logConfig && !quiet) {
        logCIConfig(ciConfig, ciDetection.reason);
      }

      return {
        config,
        isAuthenticated: !!ciConfig.apiKey,
        isCI: true,
        ciConfig,
      };
    }

    // Try to load profile configuration
    let profile: ResolvedProfile | undefined;
    let isAuthenticated = false;
    let authExpiry: string | undefined;
    let profileAccessToken: string | undefined;
    let profileOrganizationId: string | undefined;

    try {
      const profileManager = new ProfileManager();
      if (profileName) {
        const foundProfile = profileManager.getProfile(profileName);
        if (!foundProfile) {
          throw new Error(`Profile '${profileName}' not found.`);
        }
        profile = foundProfile;
      } else {
        profile = profileManager.getActiveProfile();
      }

      // Load credentials for this profile
      if (profile) {
        const credentials = await loadCredentials(profile.credential);
        if (credentials) {
          const expiryInfo = getCredentialExpiryInfo(credentials);
          if (!expiryInfo.isExpired) {
            profileAccessToken = credentials.accessToken;
            profileOrganizationId = credentials.organizationId;
            isAuthenticated = true;
            authExpiry = expiryInfo.expiresIn;
          }
        }
      }
    } catch {
      // No profile configured - continue with file config only
    }

    // Load and validate configuration from file
    const config = await validateConfiguration(configPath, tag);

    // Override config with profile values (profile takes precedence over config file)
    // Precedence: CLI flag > Profile credentials > Config file > Defaults
    if (profile) {
      config.agentsManageApiUrl = profile.remote.manageApi;
      config.agentsRunApiUrl = profile.remote.runApi;
      config.manageUiUrl = profile.remote.manageUi;

      // Profile credentials ALWAYS override config file values when using a profile
      // Config file values are intended for CI/CD scenarios without profiles
      if (profileAccessToken) {
        config.agentsManageApiKey = profileAccessToken;
      }

      // Use organization ID from authenticated session as tenantId
      if (profileOrganizationId) {
        config.tenantId = profileOrganizationId;
      }
    }

    if (s) {
      s.stop('Configuration loaded');
    }

    // Log configuration sources for debugging
    if (logConfig && !quiet) {
      if (profile) {
        const expiryText = authExpiry ? ` (expires in ${authExpiry})` : '';
        const authStatus = isAuthenticated
          ? chalk.green('authenticated') + expiryText
          : chalk.yellow('not authenticated');

        console.log(chalk.gray(`Using profile: ${chalk.cyan(profile.name)}`));
        console.log(chalk.gray(`  Remote: ${config.agentsManageApiUrl}`));
        console.log(chalk.gray(`  Environment: ${profile.environment}`));
        console.log(chalk.gray(`  Auth: ${authStatus}`));
      } else {
        console.log(chalk.gray('Configuration:'));
        console.log(chalk.gray(`  • Tenant ID: ${config.tenantId}`));
        console.log(chalk.gray(`  • Manage API URL: ${config.agentsManageApiUrl}`));
        console.log(chalk.gray(`  • Run API URL: ${config.agentsRunApiUrl}`));
        if (config.sources.configFile) {
          console.log(chalk.gray(`  • Config file: ${config.sources.configFile}`));
        }
      }
    }

    return { config, profile, isAuthenticated, authExpiry, isCI: false };
  } catch (error: any) {
    if (s) {
      s.stop('Configuration failed');
    }
    console.error(chalk.red('Error:'), error.message);

    // Provide helpful hints for common errors
    if (error.message.includes('Profile') && error.message.includes('not found')) {
      console.log(chalk.yellow('\nHint: Run "inkeep profile list" to see available profiles.'));
    } else if (error.message.includes('No configuration found')) {
      console.log(chalk.yellow('\nHint: Create a configuration file by running:'));
      console.log(chalk.gray('  inkeep init'));
    } else if (error.message.includes('Config file not found')) {
      console.log(chalk.yellow('\nHint: Check that your config file path is correct'));
    } else if (error.message.includes('tenantId') || error.message.includes('API URL')) {
      console.log(chalk.yellow('\nHint: Ensure your inkeep.config.ts has all required fields:'));
      console.log(chalk.gray('  - tenantId'));
      console.log(chalk.gray('  - agentsManageApiUrl (or agentsManageApi.url)'));
      console.log(chalk.gray('  - agentsRunApiUrl (or agentsRunApi.url)'));
    }

    process.exit(1);
  }
}

/**
 * Lightweight config loader without spinners or logging
 * Useful for commands that need config but handle their own UI
 */
export async function loadCommandConfig(
  configPath?: string,
  profileName?: string
): Promise<CommandInitResult> {
  try {
    return await initializeCommand({
      configPath,
      profileName,
      showSpinner: false,
      logConfig: false,
    });
  } catch (error: any) {
    console.error(chalk.red('Configuration error:'), error.message);
    process.exit(1);
  }
}
