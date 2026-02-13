import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as yaml from 'yaml';
import { initCommand } from '../../commands/init';
import { LOCAL_REMOTE } from '../../utils/profiles';
import type { ProfilesConfig } from '../../utils/profiles/types';

describe('init --local integration (real filesystem)', () => {
  let configDir: string;
  let profilesDir: string;

  beforeEach(() => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    configDir = join(tmpdir(), `inkeep-init-config-${id}`);
    profilesDir = join(tmpdir(), `inkeep-init-profiles-${id}`);
    mkdirSync(configDir, { recursive: true });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(configDir)) {
      rmSync(configDir, { recursive: true });
    }
    if (existsSync(profilesDir)) {
      rmSync(profilesDir, { recursive: true });
    }
  });

  it('should create profiles.yaml with correct LOCAL_REMOTE URLs', async () => {
    await initCommand({
      local: true,
      interactive: false,
      path: configDir,
      profilesDir,
    });

    const profilesPath = join(profilesDir, 'profiles.yaml');
    expect(existsSync(profilesPath), 'profiles.yaml should exist').toBe(true);

    const profiles: ProfilesConfig = yaml.parse(readFileSync(profilesPath, 'utf-8'));

    expect(profiles.activeProfile).toBe('local');
    expect(profiles.profiles.local).toBeDefined();

    const localProfile = profiles.profiles.local!;
    expect(localProfile.remote).toEqual({
      api: LOCAL_REMOTE.api,
      manageUi: LOCAL_REMOTE.manageUi,
    });
    expect(localProfile.credential).toBe('none');
    expect(localProfile.environment).toBe('development');
  });

  it('should create inkeep.config.ts with correct API URL', async () => {
    await initCommand({
      local: true,
      interactive: false,
      path: configDir,
      profilesDir,
    });

    const configPath = join(configDir, 'inkeep.config.ts');
    expect(existsSync(configPath), 'inkeep.config.ts should exist').toBe(true);

    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain(LOCAL_REMOTE.api);
    expect(content).toContain("tenantId: 'default'");
  });
});
