import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from '@inkeep/agents-core';
import * as yaml from 'yaml';
import type { ZodError } from 'zod';
import {
  CLOUD_REMOTE,
  DEFAULT_PROFILES_CONFIG,
  isLegacyRemote,
  migrateLegacyRemote,
  type Profile,
  type ProfilesConfig,
  profileNameSchema,
  profilesConfigSchema,
  type ResolvedProfile,
  type ResolvedRemoteUrls,
} from './types';

const logger = getLogger('profile-manager');

/**
 * Error thrown when profile operations fail
 */
export class ProfileError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'FILE_NOT_FOUND'
      | 'PARSE_ERROR'
      | 'VALIDATION_ERROR'
      | 'PROFILE_NOT_FOUND'
      | 'PROFILE_EXISTS'
      | 'ACTIVE_PROFILE_DELETE'
      | 'WRITE_ERROR'
  ) {
    super(message);
    this.name = 'ProfileError';
  }
}

/**
 * Format Zod errors into a human-readable message
 * Compatible with both Zod v3 (errors) and Zod v4 (issues)
 */
function formatZodErrors(error: ZodError): string {
  // Zod v4 uses 'issues', v3 uses 'errors'
  const issues = (error as any).issues ?? (error as any).errors ?? [];
  if (!Array.isArray(issues) || issues.length === 0) {
    return error.message || 'Validation failed';
  }
  return issues
    .map((err: { path?: (string | number)[]; message?: string }) => {
      const path = err.path && err.path.length > 0 ? `at '${err.path.join('.')}'` : '';
      return `${path}: ${err.message || 'Invalid value'}`.trim();
    })
    .join('\n  ');
}

/**
 * ProfileManager - handles loading, saving, and managing CLI profiles
 *
 * Profiles are stored in ~/.inkeep/profiles.yaml and allow users to switch
 * between different Inkeep deployments (cloud, local, self-hosted).
 */
export class ProfileManager {
  private profilesDir: string;
  private profilesPath: string;

  constructor(options?: { profilesDir?: string }) {
    this.profilesDir = options?.profilesDir ?? join(homedir(), '.inkeep');
    this.profilesPath = join(this.profilesDir, 'profiles.yaml');
  }

  /**
   * Get the path to the profiles.yaml file
   * Creates the ~/.inkeep directory if it doesn't exist
   */
  getProfilePath(): string {
    if (!existsSync(this.profilesDir)) {
      logger.info({ dir: this.profilesDir }, 'Creating profiles directory');
      mkdirSync(this.profilesDir, { recursive: true });
    }
    return this.profilesPath;
  }

  /**
   * Check if the profiles file exists
   */
  profilesFileExists(): boolean {
    return existsSync(this.profilesPath);
  }

  /**
   * Load and validate profiles from YAML file
   * Creates default config if file doesn't exist
   * Migrates legacy profile formats (manageApi/runApi) to new format (api)
   */
  loadProfiles(): ProfilesConfig {
    const profilePath = this.getProfilePath();

    if (!existsSync(profilePath)) {
      logger.info({}, 'Profiles file not found, creating default');
      this.saveProfiles(DEFAULT_PROFILES_CONFIG);
      return DEFAULT_PROFILES_CONFIG;
    }

    let content: string;
    try {
      content = readFileSync(profilePath, 'utf-8');
    } catch (error) {
      throw new ProfileError(
        `Failed to read profiles file: ${profilePath}\n${error instanceof Error ? error.message : String(error)}`,
        'FILE_NOT_FOUND'
      );
    }

    let parsed: unknown;
    try {
      parsed = yaml.parse(content);
    } catch (error) {
      throw new ProfileError(
        `Failed to parse profiles.yaml: ${error instanceof Error ? error.message : String(error)}`,
        'PARSE_ERROR'
      );
    }

    // Attempt migration of legacy profiles before validation
    const { migrated, migratedParsed } = this.migrateLegacyProfiles(parsed);

    const result = profilesConfigSchema.safeParse(migratedParsed);
    if (!result.success) {
      throw new ProfileError(
        `Invalid profiles.yaml:\n  ${formatZodErrors(result.error)}`,
        'VALIDATION_ERROR'
      );
    }

    const config = result.data;

    // Validate that activeProfile exists in profiles
    if (!config.profiles[config.activeProfile]) {
      throw new ProfileError(
        `Active profile '${config.activeProfile}' does not exist in profiles`,
        'VALIDATION_ERROR'
      );
    }

    // If we migrated legacy profiles, save the updated config
    if (migrated) {
      logger.info({}, 'Migrated legacy profile format (manageApi/runApi -> api)');
      this.saveProfiles(config);
    }

    logger.info({ activeProfile: config.activeProfile }, 'Profiles loaded');
    return config;
  }

  /**
   * Migrate legacy profile formats to new format
   * Old format: { manageApi, manageUi, runApi }
   * New format: { api, manageUi }
   */
  private migrateLegacyProfiles(parsed: unknown): { migrated: boolean; migratedParsed: unknown } {
    if (!parsed || typeof parsed !== 'object') {
      return { migrated: false, migratedParsed: parsed };
    }

    const parsedObj = parsed as Record<string, unknown>;
    const profiles = parsedObj.profiles;

    if (!profiles || typeof profiles !== 'object') {
      return { migrated: false, migratedParsed: parsed };
    }

    let migrated = false;
    const migratedProfiles: Record<string, unknown> = {};

    for (const [name, profile] of Object.entries(profiles as Record<string, unknown>)) {
      if (!profile || typeof profile !== 'object') {
        migratedProfiles[name] = profile;
        continue;
      }

      const profileObj = profile as Record<string, unknown>;
      const remote = profileObj.remote;

      if (isLegacyRemote(remote)) {
        // Migrate legacy remote format
        const migratedRemote = migrateLegacyRemote(remote);
        migratedProfiles[name] = {
          ...profileObj,
          remote: migratedRemote,
        };
        migrated = true;
        logger.info({ profile: name }, 'Migrating legacy profile format');
      } else {
        migratedProfiles[name] = profile;
      }
    }

    return {
      migrated,
      migratedParsed: {
        ...parsedObj,
        profiles: migratedProfiles,
      },
    };
  }

  /**
   * Save profiles to YAML file atomically (write to temp, then rename)
   */
  saveProfiles(profiles: ProfilesConfig): void {
    // Validate before saving
    const result = profilesConfigSchema.safeParse(profiles);
    if (!result.success) {
      throw new ProfileError(
        `Invalid profiles configuration:\n  ${formatZodErrors(result.error)}`,
        'VALIDATION_ERROR'
      );
    }

    // Validate activeProfile exists
    if (!profiles.profiles[profiles.activeProfile]) {
      throw new ProfileError(
        `Active profile '${profiles.activeProfile}' does not exist in profiles`,
        'VALIDATION_ERROR'
      );
    }

    const profilePath = this.getProfilePath();
    const tempPath = join(tmpdir(), `inkeep-profiles-${Date.now()}.yaml`);

    const yamlContent = yaml.stringify(profiles, {
      indent: 2,
      lineWidth: 0, // Don't wrap lines
    });

    try {
      // Write to temp file first
      writeFileSync(tempPath, yamlContent, 'utf-8');

      // Atomic rename
      renameSync(tempPath, profilePath);

      logger.info({ path: profilePath }, 'Profiles saved');
    } catch (error) {
      // Clean up temp file if it exists
      try {
        if (existsSync(tempPath)) {
          require('node:fs').unlinkSync(tempPath);
        }
      } catch {
        // Ignore cleanup errors
      }

      throw new ProfileError(
        `Failed to save profiles: ${error instanceof Error ? error.message : String(error)}`,
        'WRITE_ERROR'
      );
    }
  }

  /**
   * Get the currently active profile configuration
   */
  getActiveProfile(): ResolvedProfile {
    const config = this.loadProfiles();
    const profileName = config.activeProfile;
    const profile = config.profiles[profileName];

    if (!profile) {
      throw new ProfileError(
        `Active profile '${profileName}' not found in profiles`,
        'PROFILE_NOT_FOUND'
      );
    }

    return {
      name: profileName,
      remote: this.resolveRemoteUrls(profile),
      credential: profile.credential,
      environment: profile.environment,
    };
  }

  /**
   * Resolve remote URLs from profile configuration
   * If remote is 'cloud', returns baked-in cloud URLs
   * Otherwise returns the explicit URLs
   */
  resolveRemoteUrls(profile: Profile): ResolvedRemoteUrls {
    if (profile.remote === 'cloud') {
      return { ...CLOUD_REMOTE };
    }
    return { ...profile.remote };
  }

  /**
   * Get a specific profile by name
   */
  getProfile(name: string): ResolvedProfile | null {
    const config = this.loadProfiles();
    const profile = config.profiles[name];

    if (!profile) {
      return null;
    }

    return {
      name,
      remote: this.resolveRemoteUrls(profile),
      credential: profile.credential,
      environment: profile.environment,
    };
  }

  /**
   * List all profiles with their resolved URLs
   */
  listProfiles(): { profiles: ResolvedProfile[]; activeProfile: string } {
    const config = this.loadProfiles();
    const profiles = Object.entries(config.profiles).map(([name, profile]) => ({
      name,
      remote: this.resolveRemoteUrls(profile),
      credential: profile.credential,
      environment: profile.environment,
    }));

    return {
      profiles,
      activeProfile: config.activeProfile,
    };
  }

  /**
   * Add a new profile
   */
  addProfile(name: string, profile: Profile): void {
    // Validate profile name
    const nameResult = profileNameSchema.safeParse(name);
    if (!nameResult.success) {
      throw new ProfileError(
        `Invalid profile name: ${formatZodErrors(nameResult.error)}`,
        'VALIDATION_ERROR'
      );
    }

    const config = this.loadProfiles();

    if (config.profiles[name]) {
      throw new ProfileError(`Profile '${name}' already exists`, 'PROFILE_EXISTS');
    }

    config.profiles[name] = profile;
    this.saveProfiles(config);

    logger.info({ name }, 'Profile added');
  }

  /**
   * Set the active profile
   */
  setActiveProfile(name: string): void {
    const config = this.loadProfiles();

    if (!config.profiles[name]) {
      throw new ProfileError(`Profile '${name}' does not exist`, 'PROFILE_NOT_FOUND');
    }

    config.activeProfile = name;
    this.saveProfiles(config);

    logger.info({ name }, 'Active profile set');
  }

  /**
   * Remove a profile
   * Cannot remove the currently active profile
   */
  removeProfile(name: string): void {
    const config = this.loadProfiles();

    if (!config.profiles[name]) {
      throw new ProfileError(`Profile '${name}' does not exist`, 'PROFILE_NOT_FOUND');
    }

    if (config.activeProfile === name) {
      throw new ProfileError(
        `Cannot remove active profile '${name}'. Switch to a different profile first.`,
        'ACTIVE_PROFILE_DELETE'
      );
    }

    delete config.profiles[name];
    this.saveProfiles(config);

    logger.info({ name }, 'Profile removed');
  }

  /**
   * Check if a credential reference exists in the keychain
   * Returns true if it exists, false otherwise
   * This is a warning check - missing credentials don't block operations
   */
  async checkCredentialExists(credentialRef: string): Promise<boolean> {
    try {
      const { KeyChainStore } = await import('@inkeep/agents-core/credential-stores');
      const store = new KeyChainStore('auth', 'inkeep-cli');
      const value = await store.get(credentialRef);
      return value !== null;
    } catch {
      // If keychain is not available, assume credential might be set later
      return false;
    }
  }
}

// Export singleton instance for convenience
export const profileManager: ProfileManager = new ProfileManager();
