import * as p from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockProfileManager = vi.hoisted(() => ({
  getProfile: vi.fn().mockReturnValue(undefined),
  addProfile: vi.fn(),
  setActiveProfile: vi.fn(),
  checkCredentialExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('@clack/prompts');

vi.mock('../../utils/profiles', async () => {
  const actual = await vi.importActual('../../utils/profiles');
  return {
    ...actual,
    ProfileManager: vi.fn(() => mockProfileManager),
  };
});

import { profileAddCommand } from '../../commands/profile';
import { LOCAL_REMOTE } from '../../utils/profiles';

describe('profileAddCommand', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.clearAllMocks();
    mockProfileManager.checkCredentialExists.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Local remote type', () => {
    it('should create profile with LOCAL_REMOTE URLs without URL prompts', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('local');
      vi.mocked(p.text).mockResolvedValueOnce('development'); // environment
      vi.mocked(p.confirm).mockResolvedValueOnce(false); // switch profile

      await profileAddCommand('test-local');

      expect(mockProfileManager.addProfile).toHaveBeenCalledWith('test-local', {
        remote: { api: LOCAL_REMOTE.api, manageUi: LOCAL_REMOTE.manageUi },
        credential: 'none',
        environment: 'development',
      });
    });

    it('should not prompt for credential when Local is selected', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('local');
      vi.mocked(p.text).mockResolvedValueOnce('development'); // environment
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('test-local');

      // p.text called once (environment only), not for API URL, Manage UI URL, or credential
      expect(p.text).toHaveBeenCalledTimes(1);
      expect(p.text).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Environment name:' })
      );
    });

    it('should skip credential keychain warning for local profiles', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('local');
      vi.mocked(p.text).mockResolvedValueOnce('development');
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('test-local');

      expect(mockProfileManager.checkCredentialExists).not.toHaveBeenCalled();
    });

    it('should default environment to development for local', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('local');
      vi.mocked(p.text).mockResolvedValueOnce('development');
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('my-local');

      expect(p.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Environment name:',
          initialValue: 'development',
        })
      );
    });
  });

  describe('Cloud remote type', () => {
    it('should create profile with cloud remote string', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('cloud');
      vi.mocked(p.text)
        .mockResolvedValueOnce('production') // environment
        .mockResolvedValueOnce('inkeep-my-cloud'); // credential
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('my-cloud');

      expect(mockProfileManager.addProfile).toHaveBeenCalledWith('my-cloud', {
        remote: 'cloud',
        credential: 'inkeep-my-cloud',
        environment: 'production',
      });
    });

    it('should default environment to production for cloud', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('cloud');
      vi.mocked(p.text).mockResolvedValueOnce('production').mockResolvedValueOnce('inkeep-test');
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('test-cloud');

      expect(p.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Environment name:',
          initialValue: 'production',
        })
      );
    });
  });

  describe('Custom remote type', () => {
    it('should prompt for URLs with no initialValue', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('custom');
      vi.mocked(p.text)
        .mockResolvedValueOnce('https://api.staging.example.com') // api URL
        .mockResolvedValueOnce('https://manage.staging.example.com') // manage UI URL
        .mockResolvedValueOnce('staging') // environment
        .mockResolvedValueOnce('inkeep-staging'); // credential
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('staging');

      expect(mockProfileManager.addProfile).toHaveBeenCalledWith('staging', {
        remote: {
          api: 'https://api.staging.example.com',
          manageUi: 'https://manage.staging.example.com',
        },
        credential: 'inkeep-staging',
        environment: 'staging',
      });
    });

    it('should default environment to production for custom', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('custom');
      vi.mocked(p.text)
        .mockResolvedValueOnce('https://api.example.com')
        .mockResolvedValueOnce('https://manage.example.com')
        .mockResolvedValueOnce('production')
        .mockResolvedValueOnce('inkeep-prod');
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('prod');

      expect(p.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Environment name:',
          initialValue: 'production',
        })
      );
    });

    it('should check keychain for credential and warn if missing', async () => {
      mockProfileManager.checkCredentialExists.mockResolvedValueOnce(false);
      vi.mocked(p.select).mockResolvedValueOnce('custom');
      vi.mocked(p.text)
        .mockResolvedValueOnce('https://api.example.com')
        .mockResolvedValueOnce('https://manage.example.com')
        .mockResolvedValueOnce('production')
        .mockResolvedValueOnce('inkeep-prod');
      vi.mocked(p.confirm).mockResolvedValueOnce(false);

      await profileAddCommand('prod');

      expect(mockProfileManager.checkCredentialExists).toHaveBeenCalledWith('inkeep-prod');
    });
  });
});
