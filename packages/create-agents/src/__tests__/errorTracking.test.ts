import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableTelemetry,
  enableTelemetry,
  getTelemetryConfig,
  saveTelemetryConfig,
} from '../errorTracking';

// Mock @sentry/node
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setContext: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs-extra
vi.mock('fs-extra');

const TELEMETRY_CONFIG_DIR = path.join(os.homedir(), '.inkeep');
const TELEMETRY_CONFIG_FILE = path.join(TELEMETRY_CONFIG_DIR, 'telemetry-config.json');

describe('Error Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs-extra methods
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.ensureDirSync).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTelemetryConfig', () => {
    it('should return default config when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = getTelemetryConfig();

      expect(config).toEqual({
        enabled: true,
        askedConsent: false,
      });
    });

    it('should load config from file when it exists', async () => {
      // Need to clear the cached config first by reimporting
      vi.resetModules();

      const mockConfig = {
        enabled: false,
        askedConsent: true,
        userId: 'test-user-id',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      // Re-import to get fresh module
      const { getTelemetryConfig: freshGetTelemetryConfig } = await import('../errorTracking.js');
      const config = freshGetTelemetryConfig();

      expect(config).toEqual(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalledWith(TELEMETRY_CONFIG_FILE, 'utf-8');
    });

    it('should return default config when file read fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const config = getTelemetryConfig();

      expect(config).toEqual({
        enabled: true,
        askedConsent: false,
      });
    });
  });

  describe('saveTelemetryConfig', () => {
    it('should save config to file', () => {
      const config = {
        enabled: true,
        askedConsent: true,
        userId: 'test-user',
      };

      saveTelemetryConfig(config);

      expect(fs.ensureDirSync).toHaveBeenCalledWith(TELEMETRY_CONFIG_DIR);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TELEMETRY_CONFIG_FILE,
        JSON.stringify(config, null, 2)
      );
    });

    it('should handle save errors gracefully', () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      const config = {
        enabled: true,
        askedConsent: true,
      };

      // Should not throw
      expect(() => saveTelemetryConfig(config)).not.toThrow();
    });
  });

  describe('disableTelemetry', () => {
    it('should disable telemetry and save config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      disableTelemetry();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TELEMETRY_CONFIG_FILE,
        expect.stringContaining('"enabled": false')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TELEMETRY_CONFIG_FILE,
        expect.stringContaining('"askedConsent": true')
      );
    });
  });

  describe('enableTelemetry', () => {
    it('should enable telemetry and save config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      enableTelemetry();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TELEMETRY_CONFIG_FILE,
        expect.stringContaining('"enabled": true')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TELEMETRY_CONFIG_FILE,
        expect.stringContaining('"askedConsent": true')
      );
    });
  });

  describe('initErrorTracking', () => {
    it('should not initialize in test environment', async () => {
      const Sentry = await import('@sentry/node');

      // Import and call initErrorTracking
      const { initErrorTracking } = await import('../errorTracking.js');
      initErrorTracking('1.0.0');

      expect(Sentry.init).not.toHaveBeenCalled();
    });
  });
});
