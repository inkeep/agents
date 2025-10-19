import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { performBackgroundVersionCheck } from '../background-version-check';
import * as versionCheck from '../version-check';

describe('background-version-check', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('performBackgroundVersionCheck', () => {
    it('should display update message when newer version is available', async () => {
      // Mock checkForUpdate to return an update is needed
      vi.spyOn(versionCheck, 'checkForUpdate').mockResolvedValue({
        current: '1.0.0',
        latest: '2.0.0',
        needsUpdate: true,
      });

      performBackgroundVersionCheck();

      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('A new version of @inkeep/agents-cli is available: 2.0.0')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Run `inkeep update` to upgrade')
      );
    });

    it('should not display message when no update is available', async () => {
      // Mock checkForUpdate to return no update is needed
      vi.spyOn(versionCheck, 'checkForUpdate').mockResolvedValue({
        current: '2.0.0',
        latest: '2.0.0',
        needsUpdate: false,
      });

      performBackgroundVersionCheck();

      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should silently fail if version check fails', async () => {
      // Mock checkForUpdate to throw an error
      vi.spyOn(versionCheck, 'checkForUpdate').mockRejectedValue(
        new Error('Network error')
      );

      // Should not throw
      expect(() => performBackgroundVersionCheck()).not.toThrow();

      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not display any error message
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not block execution', () => {
      // Mock checkForUpdate with a delayed response
      vi.spyOn(versionCheck, 'checkForUpdate').mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  current: '1.0.0',
                  latest: '2.0.0',
                  needsUpdate: true,
                }),
              1000
            )
          )
      );

      const startTime = Date.now();
      performBackgroundVersionCheck();
      const endTime = Date.now();

      // Should return immediately (within 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
