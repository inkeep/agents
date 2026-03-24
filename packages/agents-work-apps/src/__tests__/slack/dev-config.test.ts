import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockLogger, mockFs } = vi.hoisted(() => ({
  mockEnv: {
    ENVIRONMENT: 'development' as string,
  },
  mockLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockFs: {
    existsSync: vi.fn<(path: string) => boolean>(),
    readFileSync: vi.fn<(path: string, encoding: string) => string>(),
    writeFileSync: vi.fn<(path: string, data: string, encoding: string) => void>(),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: mockFs.existsSync,
  readFileSync: mockFs.readFileSync,
  writeFileSync: mockFs.writeFileSync,
}));

vi.mock('../../env', () => ({
  env: mockEnv,
}));

vi.mock('../../logger', () => ({
  getLogger: () => mockLogger,
}));

import type { SlackDevConfig } from '../../slack/services/dev-config';
import {
  getDevDefaultAgent,
  isSlackDevMode,
  loadSlackDevConfig,
  resetDevConfigCache,
  saveSlackDevConfig,
} from '../../slack/services/dev-config';

const SAMPLE_CONFIG: SlackDevConfig = {
  devId: 'test-mint',
  appId: 'A0TEST123',
  clientId: '123.456',
  clientSecret: 'secret',
  signingSecret: 'signing',
  appToken: 'xapp-test',
  botToken: 'xoxb-test-token',
  teamId: 'T0TEST',
  teamName: 'test-workspace',
};

function stubConfigExists() {
  mockFs.existsSync.mockImplementation((p: string) => String(p).endsWith('.slack-dev.json'));
}

function stubConfigContent(config: SlackDevConfig = SAMPLE_CONFIG) {
  stubConfigExists();
  mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
}

describe('dev-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDevConfigCache();
    mockEnv.ENVIRONMENT = 'development';
  });

  afterEach(() => {
    resetDevConfigCache();
  });

  describe('isSlackDevMode', () => {
    it('should return true when ENVIRONMENT=development and .slack-dev.json exists', () => {
      stubConfigExists();

      expect(isSlackDevMode()).toBe(true);
    });

    it('should return false when ENVIRONMENT is not development', () => {
      mockEnv.ENVIRONMENT = 'production';
      stubConfigExists();

      expect(isSlackDevMode()).toBe(false);
    });

    it('should return false when .slack-dev.json does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(isSlackDevMode()).toBe(false);
    });

    it('should cache the result after first call', () => {
      stubConfigExists();

      isSlackDevMode();
      isSlackDevMode();

      expect(mockFs.existsSync).toHaveBeenCalledTimes(1);
    });

    it('should recompute after resetDevConfigCache', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(isSlackDevMode()).toBe(false);

      resetDevConfigCache();
      stubConfigExists();
      expect(isSlackDevMode()).toBe(true);
    });
  });

  describe('loadSlackDevConfig', () => {
    it('should read and parse .slack-dev.json', () => {
      stubConfigContent();

      const config = loadSlackDevConfig();

      expect(config).toEqual(SAMPLE_CONFIG);
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should return cached config on subsequent calls within TTL', () => {
      stubConfigContent();

      loadSlackDevConfig();
      loadSlackDevConfig();

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('should re-read after resetDevConfigCache', () => {
      stubConfigContent();

      loadSlackDevConfig();
      resetDevConfigCache();
      stubConfigContent();
      loadSlackDevConfig();

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
    });

    it('should return null when .slack-dev.json does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const config = loadSlackDevConfig();

      expect(config).toBeNull();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return null and log error on invalid JSON', () => {
      stubConfigExists();
      mockFs.readFileSync.mockReturnValue('{invalid json');

      const config = loadSlackDevConfig();

      expect(config).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return null and log error when readFileSync throws', () => {
      stubConfigExists();
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const config = loadSlackDevConfig();

      expect(config).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('saveSlackDevConfig', () => {
    it('should write config to .slack-dev.json', () => {
      stubConfigExists();

      const result = saveSlackDevConfig(SAMPLE_CONFIG);

      expect(result).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const writtenContent = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(JSON.parse(writtenContent)).toEqual(SAMPLE_CONFIG);
    });

    it('should update the in-memory cache after save', () => {
      stubConfigContent();

      const updated = { ...SAMPLE_CONFIG, teamName: 'updated' };
      saveSlackDevConfig(updated);

      const loaded = loadSlackDevConfig();

      expect(loaded?.teamName).toBe('updated');
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return false when .slack-dev.json path is not found', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = saveSlackDevConfig(SAMPLE_CONFIG);

      expect(result).toBe(false);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should return false and log error when writeFileSync throws', () => {
      stubConfigExists();
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const result = saveSlackDevConfig(SAMPLE_CONFIG);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getDevDefaultAgent', () => {
    it('should return null when config is null', () => {
      expect(getDevDefaultAgent(null)).toBeNull();
    });

    it('should return null when metadata is undefined', () => {
      expect(getDevDefaultAgent(SAMPLE_CONFIG)).toBeNull();
    });

    it('should return null when default_agent is not set', () => {
      const config = { ...SAMPLE_CONFIG, metadata: {} };
      expect(getDevDefaultAgent(config)).toBeNull();
    });

    it('should parse and return valid default_agent JSON', () => {
      const agent = {
        agentId: 'a1',
        projectId: 'p1',
        agentName: 'Agent',
        projectName: 'Project',
      };
      const config = {
        ...SAMPLE_CONFIG,
        metadata: { default_agent: JSON.stringify(agent) },
      };

      expect(getDevDefaultAgent(config)).toEqual(agent);
    });

    it('should return null for invalid JSON and log a warning', () => {
      const config = {
        ...SAMPLE_CONFIG,
        metadata: { default_agent: 'not-json' },
      };

      expect(getDevDefaultAgent(config)).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should return null when default_agent is empty string', () => {
      const config = {
        ...SAMPLE_CONFIG,
        metadata: { default_agent: '' },
      };

      expect(getDevDefaultAgent(config)).toBeNull();
    });
  });

  describe('resetDevConfigCache', () => {
    it('should clear all cached state', () => {
      stubConfigContent();

      isSlackDevMode();
      loadSlackDevConfig();

      resetDevConfigCache();

      mockFs.existsSync.mockReturnValue(false);
      expect(isSlackDevMode()).toBe(false);

      stubConfigExists();
      resetDevConfigCache();
      stubConfigContent();

      expect(isSlackDevMode()).toBe(true);
      const config = loadSlackDevConfig();
      expect(config).toEqual(SAMPLE_CONFIG);
    });
  });
});
