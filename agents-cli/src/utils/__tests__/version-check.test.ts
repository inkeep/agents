import { describe, it, expect, beforeEach, vi } from 'vitest';
import { compareVersions, checkForUpdate, getCurrentVersion, getChangelogUrl } from '../version-check';

describe('version-check', () => {
  describe('compareVersions', () => {
    it('should return -1 when v1 < v2', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should return 0 when v1 === v2', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
    });

    it('should return 1 when v1 > v2', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('should handle versions with different segment counts', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0')).toBe(0);
      expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return a valid semver string', () => {
      const version = getCurrentVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('checkForUpdate', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should indicate update needed when latest > current', async () => {
      // Mock fetch to return a newer version
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: '999.0.0' }),
      });

      const result = await checkForUpdate();

      expect(result.needsUpdate).toBe(true);
      expect(result.latest).toBe('999.0.0');
      expect(result.current).toBeDefined();
    });

    it('should indicate no update needed when versions are equal', async () => {
      const currentVersion = getCurrentVersion();

      // Mock fetch to return same version
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: currentVersion }),
      });

      const result = await checkForUpdate();

      expect(result.needsUpdate).toBe(false);
      expect(result.latest).toBe(currentVersion);
      expect(result.current).toBe(currentVersion);
    });

    it('should handle fetch errors gracefully', async () => {
      // Mock fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(checkForUpdate()).rejects.toThrow('Unable to check for updates');
    });

    it('should handle non-ok responses', async () => {
      // Mock fetch to return non-ok response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(checkForUpdate()).rejects.toThrow('Unable to check for updates');
    });
  });

  describe('getChangelogUrl', () => {
    it('should return the changelog URL', () => {
      const url = getChangelogUrl();
      expect(url).toContain('github.com');
      expect(url).toContain('agents-cli');
      expect(url).toContain('CHANGELOG.md');
    });
  });
});
