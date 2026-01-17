import { z } from 'zod';

/**
 * Baked-in URLs for Inkeep Cloud deployment
 */
export const CLOUD_REMOTE = {
  manageApi: 'https://manage-api.inkeep.com',
  manageUi: 'https://manage.inkeep.com',
  runApi: 'https://run-api.inkeep.com',
} as const;

/**
 * Schema for explicit remote URLs (custom/local deployments)
 */
export const explicitRemoteSchema: z.ZodType<ExplicitRemote> = z.object({
  manageApi: z.string().url('manageApi must be a valid URL'),
  manageUi: z.string().url('manageUi must be a valid URL'),
  runApi: z.string().url('runApi must be a valid URL'),
});

/**
 * Schema for remote configuration - either 'cloud' shorthand or explicit URLs
 */
export const remoteSchema = z.union([z.literal('cloud'), explicitRemoteSchema]);

/**
 * Profile name validation - alphanumeric + hyphens only
 */
export const profileNameSchema = z
  .string()
  .min(1, 'Profile name cannot be empty')
  .max(64, 'Profile name too long (max 64 characters)')
  .regex(/^[a-z0-9-]+$/, 'Profile name must be lowercase alphanumeric with hyphens only');

/**
 * Schema for a single profile configuration
 */
export const profileSchema = z.object({
  remote: remoteSchema,
  credential: z.string().min(1, 'Credential reference cannot be empty'),
  environment: z.string().min(1, 'Environment cannot be empty'),
});

/**
 * Schema for the entire profiles.yaml configuration
 * Note: We use z.record(z.string(), profileSchema) for Zod v4 compatibility
 * Profile name validation is done separately in addProfile
 */
export const profilesConfigSchema = z.object({
  activeProfile: z.string().min(1, 'activeProfile cannot be empty'),
  profiles: z.record(z.string(), profileSchema),
});

/**
 * Explicit remote URLs type
 */
export interface ExplicitRemote {
  manageApi: string;
  manageUi: string;
  runApi: string;
}

/**
 * Remote configuration type - either 'cloud' or explicit URLs
 */
export type RemoteConfig = z.infer<typeof remoteSchema>;

/**
 * Single profile configuration type
 */
export type Profile = z.infer<typeof profileSchema>;

/**
 * Full profiles configuration type
 */
export type ProfilesConfig = z.infer<typeof profilesConfigSchema>;

/**
 * Resolved remote URLs - always explicit, never 'cloud'
 */
export interface ResolvedRemoteUrls {
  manageApi: string;
  manageUi: string;
  runApi: string;
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
  manageApi: 'http://localhost:3002',
  manageUi: 'http://localhost:3001',
  runApi: 'http://localhost:3003',
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
