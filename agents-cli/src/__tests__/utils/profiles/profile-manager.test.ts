import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as yaml from 'yaml';
import { ProfileError, ProfileManager } from '../../../utils/profiles/profile-manager';
import {
  CLOUD_REMOTE,
  DEFAULT_PROFILES_CONFIG,
  LOCAL_REMOTE,
  type Profile,
  type ProfilesConfig,
} from '../../../utils/profiles/types';

describe('ProfileManager', () => {
  let testDir: string;
  let profileManager: ProfileManager;

  beforeEach(() => {
    testDir = join(tmpdir(), `inkeep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    profileManager = new ProfileManager({ profilesDir: testDir });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('getProfilePath', () => {
    it('should return path to profiles.yaml', () => {
      const path = profileManager.getProfilePath();
      expect(path).toBe(join(testDir, 'profiles.yaml'));
    });

    it('should create directory if it does not exist', () => {
      const newDir = join(testDir, 'nested', 'dir');
      const manager = new ProfileManager({ profilesDir: newDir });
      manager.getProfilePath();
      expect(existsSync(newDir)).toBe(true);
    });
  });

  describe('loadProfiles', () => {
    it('should create default config if file does not exist', () => {
      const config = profileManager.loadProfiles();
      expect(config).toEqual(DEFAULT_PROFILES_CONFIG);
      expect(existsSync(join(testDir, 'profiles.yaml'))).toBe(true);
    });

    it('should load existing valid config', () => {
      const customConfig: ProfilesConfig = {
        activeProfile: 'local',
        profiles: {
          local: {
            remote: {
              api: LOCAL_REMOTE.api,
              manageUi: LOCAL_REMOTE.manageUi,
            },
            credential: 'local-cred',
            environment: 'development',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(customConfig));

      const loaded = profileManager.loadProfiles();
      expect(loaded).toEqual(customConfig);
    });

    it('should throw on invalid YAML syntax', () => {
      writeFileSync(join(testDir, 'profiles.yaml'), 'invalid: yaml: content::');

      expect(() => profileManager.loadProfiles()).toThrow(ProfileError);
    });

    it('should throw on schema validation error', () => {
      const invalidConfig = {
        activeProfile: 'test',
        profiles: {
          test: {
            remote: 'invalid-remote', // Not 'cloud' or valid URL object
            credential: 'cred',
            environment: 'dev',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(invalidConfig));

      expect(() => profileManager.loadProfiles()).toThrow(ProfileError);
    });

    it('should throw when activeProfile does not exist in profiles', () => {
      const invalidConfig: ProfilesConfig = {
        activeProfile: 'nonexistent',
        profiles: {
          cloud: {
            remote: 'cloud',
            credential: 'cred',
            environment: 'production',
          },
        },
      };

      writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(invalidConfig));

      expect(() => profileManager.loadProfiles()).toThrow(/Active profile.*does not exist/);
    });
  });

  describe('saveProfiles', () => {
    it('should save valid config', () => {
      const config: ProfilesConfig = {
        activeProfile: 'test',
        profiles: {
          test: {
            remote: 'cloud',
            credential: 'test-cred',
            environment: 'production',
          },
        },
      };

      profileManager.saveProfiles(config);

      const content = readFileSync(join(testDir, 'profiles.yaml'), 'utf-8');
      const loaded = yaml.parse(content);
      expect(loaded).toEqual(config);
    });

    it('should throw on invalid config', () => {
      const invalidConfig = {
        activeProfile: '',
        profiles: {},
      } as ProfilesConfig;

      expect(() => profileManager.saveProfiles(invalidConfig)).toThrow(ProfileError);
    });

    it('should throw when activeProfile does not exist', () => {
      const config: ProfilesConfig = {
        activeProfile: 'nonexistent',
        profiles: {
          cloud: {
            remote: 'cloud',
            credential: 'cred',
            environment: 'production',
          },
        },
      };

      expect(() => profileManager.saveProfiles(config)).toThrow(/Active profile.*does not exist/);
    });
  });

  describe('resolveRemoteUrls', () => {
    it('should resolve cloud shorthand to baked-in URLs', () => {
      const profile: Profile = {
        remote: 'cloud',
        credential: 'cred',
        environment: 'production',
      };

      const urls = profileManager.resolveRemoteUrls(profile);
      expect(urls).toEqual(CLOUD_REMOTE);
    });

    it('should return explicit URLs as-is', () => {
      const customUrls = {
        api: 'http://custom:3002',
        manageUi: 'http://custom:3000',
      };

      const profile: Profile = {
        remote: customUrls,
        credential: 'cred',
        environment: 'development',
      };

      const urls = profileManager.resolveRemoteUrls(profile);
      expect(urls).toEqual(customUrls);
    });
  });

  describe('getActiveProfile', () => {
    it('should return resolved active profile', () => {
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

      const active = profileManager.getActiveProfile();
      expect(active.name).toBe('cloud');
      expect(active.remote).toEqual(CLOUD_REMOTE);
      expect(active.credential).toBe('inkeep-cloud');
      expect(active.environment).toBe('production');
    });
  });

  describe('getProfile', () => {
    beforeEach(() => {
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
    });

    it('should return profile by name', () => {
      const profile = profileManager.getProfile('local');
      expect(profile).not.toBeNull();
      expect(profile?.name).toBe('local');
      expect(profile?.environment).toBe('development');
    });

    it('should return null for nonexistent profile', () => {
      const profile = profileManager.getProfile('nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('listProfiles', () => {
    it('should list all profiles with active marker', () => {
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

      const { profiles, activeProfile } = profileManager.listProfiles();
      expect(profiles).toHaveLength(2);
      expect(activeProfile).toBe('cloud');
      expect(profiles.map((p) => p.name).sort()).toEqual(['cloud', 'local']);
    });
  });

  describe('addProfile', () => {
    beforeEach(() => {
      profileManager.loadProfiles(); // Create default config
    });

    it('should add a new profile', () => {
      const profile: Profile = {
        remote: {
          api: LOCAL_REMOTE.api,
          manageUi: LOCAL_REMOTE.manageUi,
        },
        credential: 'new-cred',
        environment: 'development',
      };

      profileManager.addProfile('new-profile', profile);

      const loaded = profileManager.loadProfiles();
      expect(loaded.profiles['new-profile']).toEqual(profile);
    });

    it('should throw when profile already exists', () => {
      expect(() =>
        profileManager.addProfile('cloud', {
          remote: 'cloud',
          credential: 'cred',
          environment: 'production',
        })
      ).toThrow(/already exists/);
    });

    it('should validate profile name format', () => {
      expect(() =>
        profileManager.addProfile('Invalid Name!', {
          remote: 'cloud',
          credential: 'cred',
          environment: 'production',
        })
      ).toThrow(/lowercase alphanumeric/);
    });
  });

  describe('setActiveProfile', () => {
    beforeEach(() => {
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
    });

    it('should set active profile', () => {
      profileManager.setActiveProfile('local');

      const loaded = profileManager.loadProfiles();
      expect(loaded.activeProfile).toBe('local');
    });

    it('should throw for nonexistent profile', () => {
      expect(() => profileManager.setActiveProfile('nonexistent')).toThrow(/does not exist/);
    });
  });

  describe('removeProfile', () => {
    beforeEach(() => {
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
    });

    it('should remove a profile', () => {
      profileManager.removeProfile('local');

      const loaded = profileManager.loadProfiles();
      expect(loaded.profiles.local).toBeUndefined();
      expect(Object.keys(loaded.profiles)).toEqual(['cloud']);
    });

    it('should throw when removing active profile', () => {
      expect(() => profileManager.removeProfile('cloud')).toThrow(/Cannot remove active profile/);
    });

    it('should throw when profile does not exist', () => {
      expect(() => profileManager.removeProfile('nonexistent')).toThrow(/does not exist/);
    });
  });
});

describe('Profile Schema Validation', () => {
  let testDir: string;
  let profileManager: ProfileManager;

  beforeEach(() => {
    testDir = join(tmpdir(), `inkeep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    profileManager = new ProfileManager({ profilesDir: testDir });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should accept valid cloud profile', () => {
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

    profileManager.saveProfiles(config);
    const loaded = profileManager.loadProfiles();
    expect(loaded).toEqual(config);
  });

  it('should accept valid custom remote profile', () => {
    const config: ProfilesConfig = {
      activeProfile: 'local',
      profiles: {
        local: {
          remote: {
            api: 'https://api.example.com',
            manageUi: 'https://manage.example.com',
          },
          credential: 'custom-cred',
          environment: 'staging',
        },
      },
    };

    profileManager.saveProfiles(config);
    const loaded = profileManager.loadProfiles();
    expect(loaded).toEqual(config);
  });

  it('should reject invalid URL in remote', () => {
    const invalidConfig = {
      activeProfile: 'bad',
      profiles: {
        bad: {
          remote: {
            api: 'not-a-url',
            manageUi: 'http://valid.com',
          },
          credential: 'cred',
          environment: 'dev',
        },
      },
    };

    writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(invalidConfig));
    expect(() => profileManager.loadProfiles()).toThrow(ProfileError);
  });

  it('should reject empty credential', () => {
    const invalidConfig = {
      activeProfile: 'bad',
      profiles: {
        bad: {
          remote: 'cloud',
          credential: '',
          environment: 'dev',
        },
      },
    };

    writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(invalidConfig));
    expect(() => profileManager.loadProfiles()).toThrow(ProfileError);
  });

  it('should accept profile names with special chars when loaded from file', () => {
    // Note: Profile name validation is only enforced via addProfile method
    // Legacy profiles with non-standard names can still be loaded
    const config = {
      activeProfile: 'my-profile',
      profiles: {
        'my-profile': {
          remote: 'cloud',
          credential: 'cred',
          environment: 'dev',
        },
      },
    };

    writeFileSync(join(testDir, 'profiles.yaml'), yaml.stringify(config));
    const loaded = profileManager.loadProfiles();
    expect(loaded.profiles['my-profile']).toBeDefined();
  });
});
