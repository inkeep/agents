import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as yaml from 'yaml';
import {
  type CLICredentials,
  getCredentialExpiryInfo,
  isCredentialExpired,
} from '../../utils/credentials';
import { LOCAL_REMOTE } from '../../utils/profiles';
import type { ProfilesConfig } from '../../utils/profiles/types';

describe('CLI Authentication', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `inkeep-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('credential expiry utilities', () => {
    it('should check if credentials are expired', () => {
      const notExpired: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      const expired: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
      };

      const noExpiry: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
      };

      expect(isCredentialExpired(notExpired)).toBe(false);
      expect(isCredentialExpired(expired)).toBe(true);
      expect(isCredentialExpired(noExpiry)).toBe(false);
    });

    it('should get credential expiry info for valid credentials', () => {
      // Use 2.5 hours to ensure we get '2h' even with timing variations
      // (Math.floor of ms could give 1h if exactly 2 hours due to ms precision)
      const expiresIn2Hours: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 2.5 * 3600000).toISOString(),
      };

      const info = getCredentialExpiryInfo(expiresIn2Hours);
      expect(info.isExpired).toBe(false);
      expect(info.expiresIn).toBe('2h');
    });

    it('should get credential expiry info for expired credentials', () => {
      const expired: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
      };

      const info = getCredentialExpiryInfo(expired);
      expect(info.isExpired).toBe(true);
      expect(info.expiresAt).toBeDefined();
    });

    it('should handle credentials without expiry', () => {
      const noExpiry: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
      };

      const info = getCredentialExpiryInfo(noExpiry);
      expect(info.isExpired).toBe(false);
      expect(info.expiresIn).toBeUndefined();
    });

    it('should format expiry in days for long durations', () => {
      // Use 3.5 days to ensure we get '3d' even with timing variations
      // (Math.floor of hours/24 could give 2 if exactly 3 days due to ms precision)
      const expiresIn3Days: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3.5 * 24 * 3600000).toISOString(),
      };

      const info = getCredentialExpiryInfo(expiresIn3Days);
      expect(info.isExpired).toBe(false);
      expect(info.expiresIn).toBe('3d');
    });

    it('should format expiry in minutes for short durations', () => {
      const expiresIn30Minutes: CLICredentials = {
        accessToken: 'token',
        userId: 'user',
        userEmail: 'test@example.com',
        organizationId: 'org',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      };

      const info = getCredentialExpiryInfo(expiresIn30Minutes);
      expect(info.isExpired).toBe(false);
      expect(info.expiresIn).toBe('30m');
    });
  });

  describe('profile integration', () => {
    it('should resolve credential key from profile', async () => {
      const { ProfileManager } = await import('../../utils/profiles');

      const profileManager = new ProfileManager({ profilesDir: testDir });

      const config: ProfilesConfig = {
        activeProfile: 'cloud',
        profiles: {
          cloud: {
            remote: 'cloud',
            credential: 'inkeep-cloud',
            environment: 'production',
          },
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

      const activeProfile = profileManager.getActiveProfile();
      expect(activeProfile.credential).toBe('inkeep-cloud');

      const localProfile = profileManager.getProfile('local');
      expect(localProfile?.credential).toBe('inkeep-local');
    });

    it('should use credential key for different profiles', async () => {
      const { ProfileManager } = await import('../../utils/profiles');

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
            remote: 'cloud',
            credential: 'inkeep-staging',
            environment: 'staging',
          },
          development: {
            remote: {
              api: LOCAL_REMOTE.api,
              manageUi: LOCAL_REMOTE.manageUi,
            },
            credential: 'inkeep-dev',
            environment: 'development',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));

      expect(profileManager.getProfile('production')?.credential).toBe('inkeep-prod');
      expect(profileManager.getProfile('staging')?.credential).toBe('inkeep-staging');
      expect(profileManager.getProfile('development')?.credential).toBe('inkeep-dev');

      const active = profileManager.getActiveProfile();
      expect(active.name).toBe('staging');
      expect(active.credential).toBe('inkeep-staging');
    });
  });
});
