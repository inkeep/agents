import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as yaml from 'yaml';
import { LOCAL_REMOTE, ProfileManager } from '../../utils/profiles';
import type { ProfilesConfig } from '../../utils/profiles/types';

describe('Profile Configuration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `inkeep-profile-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('profile resolution', () => {
    it('should resolve active profile by default', () => {
      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'staging',
        profiles: {
          production: {
            remote: 'cloud',
            credential: 'inkeep-prod',
            environment: 'production',
          },
          staging: {
            remote: {
              api: 'https://staging-api.example.com',
              manageUi: 'https://staging.example.com',
            },
            credential: 'inkeep-staging',
            environment: 'staging',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      const active = profileManager.getActiveProfile();
      expect(active.name).toBe('staging');
      expect(active.remote.api).toBe('https://staging-api.example.com');
      expect(active.environment).toBe('staging');
    });

    it('should resolve specific profile by name', () => {
      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'staging',
        profiles: {
          production: {
            remote: 'cloud',
            credential: 'inkeep-prod',
            environment: 'production',
          },
          staging: {
            remote: {
              api: 'https://staging-api.example.com',
              manageUi: 'https://staging.example.com',
            },
            credential: 'inkeep-staging',
            environment: 'staging',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      const profile = profileManager.getProfile('production');
      expect(profile?.name).toBe('production');
      expect(profile?.remote.api).toBe('https://api.agents.inkeep.com');
      expect(profile?.environment).toBe('production');
    });

    it('should return null for non-existent profile', () => {
      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'cloud',
        profiles: {
          cloud: {
            remote: 'cloud',
            credential: 'inkeep-cloud',
            environment: 'production',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      const profile = profileManager.getProfile('non-existent');
      expect(profile).toBeNull();
    });
  });

  describe('URL resolution', () => {
    it('should resolve cloud shorthand to production URLs', () => {
      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'cloud',
        profiles: {
          cloud: {
            remote: 'cloud',
            credential: 'inkeep-cloud',
            environment: 'production',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      const profile = profileManager.getActiveProfile();
      expect(profile.remote.api).toBe('https://api.agents.inkeep.com');
      expect(profile.remote.manageUi).toBe('https://app.inkeep.com');
    });

    it('should use explicit URLs when provided', () => {
      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'local',
        profiles: {
          local: {
            remote: {
              api: LOCAL_REMOTE.api,
              manageUi: LOCAL_REMOTE.manageUi,
            },
            credential: 'inkeep-local',
            environment: 'development',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      const profile = profileManager.getActiveProfile();
      expect(profile.remote.api).toBe(LOCAL_REMOTE.api);
      expect(profile.remote.manageUi).toBe(LOCAL_REMOTE.manageUi);
    });
  });

  describe('credential reference', () => {
    it('should provide credential key for keychain lookup', () => {
      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'cloud',
        profiles: {
          cloud: {
            remote: 'cloud',
            credential: 'my-custom-credential-key',
            environment: 'production',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      const profile = profileManager.getActiveProfile();
      expect(profile.credential).toBe('my-custom-credential-key');
    });
  });

  describe('environment handling', () => {
    it('should provide environment name for .env file loading', () => {
      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'staging',
        profiles: {
          staging: {
            remote: 'cloud',
            credential: 'inkeep-staging',
            environment: 'staging',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      const profile = profileManager.getActiveProfile();
      expect(profile.environment).toBe('staging');
    });
  });
});
