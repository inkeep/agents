import { existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { getCredentialExpiryInfo, loadCredentials } from './credentials';
import { LOCAL_REMOTE, ProfileManager, type ResolvedProfile } from './profiles';

export interface ProfileConfig {
  profileName: string;
  tenantId?: string;
  agentsApiUrl: string;
  manageUiUrl: string;
  environment: string;
  credentialKey: string;
  accessToken?: string;
  isAuthenticated: boolean;
  authExpiry?: string;
}

export interface ProfileConfigOptions {
  profileName?: string;
  quiet?: boolean;
  projectDir?: string;
}

export async function resolveProfileConfig(
  options: ProfileConfigOptions = {}
): Promise<ProfileConfig> {
  const profileManager = new ProfileManager();
  let profile: ResolvedProfile;
  let profileName: string;

  try {
    if (options.profileName) {
      const foundProfile = profileManager.getProfile(options.profileName);
      if (!foundProfile) {
        console.error(chalk.red(`Profile '${options.profileName}' not found.`));
        console.log(chalk.gray('Run "inkeep profile list" to see available profiles.'));
        process.exit(1);
      }
      profile = foundProfile;
      profileName = options.profileName;
    } else {
      profile = profileManager.getActiveProfile();
      profileName = profile.name;
    }
  } catch {
    // No profile configured - return defaults for backward compatibility
    return {
      profileName: 'default',
      agentsApiUrl: LOCAL_REMOTE.api,
      manageUiUrl: LOCAL_REMOTE.manageUi,
      environment: 'development',
      credentialKey: 'auth-credentials',
      isAuthenticated: false,
    };
  }

  // Load credentials for this profile
  const credentials = await loadCredentials(profile.credential);
  let accessToken: string | undefined;
  let isAuthenticated = false;
  let authExpiry: string | undefined;

  if (credentials) {
    const expiryInfo = getCredentialExpiryInfo(credentials);
    if (!expiryInfo.isExpired) {
      accessToken = credentials.accessToken;
      isAuthenticated = true;
      authExpiry = expiryInfo.expiresIn;
    }
  }

  // Load environment file if specified and project dir is available
  if (options.projectDir && profile.environment) {
    const envFile = join(options.projectDir, `.env.${profile.environment}`);
    if (existsSync(envFile)) {
      dotenv.config({ path: envFile });
    }
  }

  return {
    profileName,
    tenantId: credentials?.organizationId,
    agentsApiUrl: profile.remote.api,
    manageUiUrl: profile.remote.manageUi,
    environment: profile.environment,
    credentialKey: profile.credential,
    accessToken,
    isAuthenticated,
    authExpiry,
  };
}

export function logProfileConfig(config: ProfileConfig, quiet: boolean = false): void {
  if (quiet) return;

  console.log(chalk.gray(`Using profile: ${chalk.cyan(config.profileName)}`));
  console.log(chalk.gray(`  Remote: ${config.agentsApiUrl}`));
  console.log(chalk.gray(`  Environment: ${config.environment}`));

  if (config.isAuthenticated) {
    const expiryText = config.authExpiry ? ` (expires in ${config.authExpiry})` : '';
    console.log(chalk.gray(`  Auth: ${chalk.green('authenticated')}${expiryText}`));
  } else {
    console.log(chalk.gray(`  Auth: ${chalk.yellow('not authenticated')}`));
  }
}

export function getAuthHeaders(config: ProfileConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }

  return headers;
}
