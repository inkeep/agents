import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { checkKeychainAvailability } from './credentials';

export interface CIEnvironmentConfig {
  isCI: boolean;
  reason?: string;
  apiKey?: string;
  manageApiUrl?: string;
  runApiUrl?: string;
  environment?: string;
  tenantId?: string;
}

export interface CIDetectionResult {
  isCI: boolean;
  reason: string;
}

export async function detectCIEnvironment(): Promise<CIDetectionResult> {
  // Check explicit CI flag
  if (process.env.INKEEP_CI === 'true') {
    return { isCI: true, reason: 'INKEEP_CI=true' };
  }

  // Check common CI environment variables
  if (process.env.CI === 'true' || process.env.CI === '1') {
    return { isCI: true, reason: 'CI environment detected' };
  }

  // Check GitHub Actions
  if (process.env.GITHUB_ACTIONS === 'true') {
    return { isCI: true, reason: 'GitHub Actions detected' };
  }

  // Check GitLab CI
  if (process.env.GITLAB_CI === 'true') {
    return { isCI: true, reason: 'GitLab CI detected' };
  }

  // Check Jenkins
  if (process.env.JENKINS_URL) {
    return { isCI: true, reason: 'Jenkins detected' };
  }

  // Check CircleCI
  if (process.env.CIRCLECI === 'true') {
    return { isCI: true, reason: 'CircleCI detected' };
  }

  // Check no profiles.yaml exists
  const profilesPath = join(homedir(), '.inkeep', 'profiles.yaml');
  const profilesExist = existsSync(profilesPath);

  // Check keychain availability
  const { available: keychainAvailable } = await checkKeychainAvailability();

  // If no profiles and no keychain, treat as CI
  if (!profilesExist && !keychainAvailable) {
    return { isCI: true, reason: 'no keychain available' };
  }

  // If keychain unavailable and INKEEP_API_KEY is set, treat as CI
  if (!keychainAvailable && process.env.INKEEP_API_KEY) {
    return { isCI: true, reason: 'no keychain available, using API key' };
  }

  return { isCI: false, reason: '' };
}

export function loadCIEnvironmentConfig(): CIEnvironmentConfig | null {
  const apiKey = process.env.INKEEP_API_KEY;
  const manageApiUrl = process.env.INKEEP_MANAGE_API_URL;
  const runApiUrl = process.env.INKEEP_RUN_API_URL;
  const environment = process.env.INKEEP_ENVIRONMENT || 'production';
  const tenantId = process.env.INKEEP_TENANT_ID;

  // If no API key, CI mode isn't properly configured
  if (!apiKey) {
    return null;
  }

  return {
    isCI: true,
    apiKey,
    manageApiUrl: manageApiUrl || 'https://manage-api.inkeep.com',
    runApiUrl: runApiUrl || 'https://run-api.inkeep.com',
    environment,
    tenantId,
  };
}

export function logCIConfig(config: CIEnvironmentConfig, reason: string): void {
  console.log(chalk.yellow(`CI mode detected (${reason})`));
  console.log(chalk.gray(`  Remote: ${config.manageApiUrl}`));
  console.log(chalk.gray(`  Environment: ${config.environment}`));
  console.log(chalk.gray(`  Auth: API key (INKEEP_API_KEY)`));
  if (config.tenantId) {
    console.log(chalk.gray(`  Tenant: ${config.tenantId}`));
  }
}

export function getAuthHeaders(
  config: { accessToken?: string; apiKey?: string },
  isCI: boolean = false
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (isCI && config.apiKey) {
    headers['X-API-Key'] = config.apiKey;
  } else if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }

  return headers;
}

export function validateCIConfig(config: CIEnvironmentConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push('INKEEP_API_KEY environment variable is required in CI mode');
  }

  return { valid: errors.length === 0, errors };
}
