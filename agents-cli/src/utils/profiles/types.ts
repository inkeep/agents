import { z } from 'zod';

/**
 * Baked-in URLs for Inkeep Cloud deployment
 */
export const CLOUD_REMOTE = {
  api: 'https://api.agents.inkeep.com',
  manageUi: 'https://app.inkeep.com',
} as const;

/**
 * Schema for explicit remote URLs (custom/local deployments)
 */
export const explicitRemoteSchema: z.ZodType<ExplicitRemote> = z.object({
  api: z.string().url('api must be a valid URL'),
  manageUi: z.string().url('manageUi must be a valid URL'),
});

/**
 * Schema for remote configuration - either 'cloud' shorthand or explicit URLs
 */
export const remoteSchema: z.ZodType<RemoteConfig> = z.union([
  z.literal('cloud'),
  explicitRemoteSchema,
]);

/**
 * Profile name validation - alphanumeric + hyphens only
 */
export const profileNameSchema: z.ZodType<string> = z
  .string()
  .min(1, 'Profile name cannot be empty')
  .max(64, 'Profile name too long (max 64 characters)')
  .regex(/^[a-z0-9-]+$/, 'Profile name must be lowercase alphanumeric with hyphens only');

/**
 * Schema for a single profile configuration
 */
export const profileSchema: z.ZodType<Profile> = z.object({
  remote: remoteSchema,
  credential: z.string().min(1, 'Credential reference cannot be empty'),
  environment: z.string().min(1, 'Environment cannot be empty'),
});

/**
 * Schema for the entire profiles.yaml configuration
 * Note: We use z.record(z.string(), profileSchema) for Zod v4 compatibility
 * Profile name validation is done separately in addProfile
 */
export const profilesConfigSchema: z.ZodType<ProfilesConfig> = z.object({
  activeProfile: z.string().min(1, 'activeProfile cannot be empty'),
  profiles: z.record(z.string(), profileSchema),
});

/**
 * Explicit remote URLs type
 */
export interface ExplicitRemote {
  api: string;
  manageUi: string;
}

/**
 * Remote configuration type - either 'cloud' or explicit URLs
 */
export type RemoteConfig = 'cloud' | ExplicitRemote;

/**
 * Single profile configuration type
 */
export interface Profile {
  remote: RemoteConfig;
  credential: string;
  environment: string;
}

/**
 * Full profiles configuration type
 */
export interface ProfilesConfig {
  activeProfile: string;
  profiles: Record<string, Profile>;
}

/**
 * Resolved remote URLs - always explicit, never 'cloud'
 */
export interface ResolvedRemoteUrls {
  api: string;
  manageUi: string;
}

/**
 * Profile with resolved URLs for easy consumption
 */
export interface ResolvedProfile {
  name: string;
  remote: ResolvedRemoteUrls;
  credential: string;
  environment: string;
}

/**
 * Default cloud profile configuration
 */
export const DEFAULT_CLOUD_PROFILE: Profile = {
  remote: 'cloud',
  credential: 'inkeep-cloud',
  environment: 'production',
};

/**
 * Default profiles.yaml content when creating for the first time
 */
export const DEFAULT_PROFILES_CONFIG: ProfilesConfig = {
  activeProfile: 'cloud',
  profiles: {
    cloud: DEFAULT_CLOUD_PROFILE,
  },
};

/**
 * Baked-in URLs for local development deployment
 */
export const LOCAL_REMOTE = {
  api: 'http://localhost:3002',
  manageUi: 'http://localhost:3000',
} as const;

/**
 * Default local profile configuration
 * Note: credential is 'none' as local deployments typically don't require auth
 */
export const DEFAULT_LOCAL_PROFILE: Profile = {
  remote: LOCAL_REMOTE,
  credential: 'none',
  environment: 'development',
};
