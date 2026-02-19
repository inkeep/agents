import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { env } from '../../env';
import { getLogger } from '../../logger';
import type { DefaultAgentConfig } from './nango';

const logger = getLogger('slack-dev-config');

const DEV_CONFIG_FILENAME = '.slack-dev.json';
const CACHE_TTL_MS = 5_000;

export interface SlackDevConfig {
  devId: string;
  appId: string;
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  appToken: string;
  botToken: string;
  teamId: string;
  teamName: string;
  configRefreshToken?: string;
  metadata?: Record<string, string>;
}

let cachedConfig: SlackDevConfig | null = null;
let cacheExpiresAt = 0;

let resolvedConfigPath: string | null | undefined;

function findDevConfigPath(): string | null {
  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, DEV_CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir || parsePath(dir).root === dir) break;
    dir = parent;
  }
  return null;
}

function getDevConfigPath(): string | null {
  if (resolvedConfigPath !== undefined) return resolvedConfigPath;
  resolvedConfigPath = findDevConfigPath();
  return resolvedConfigPath;
}

let devModeChecked = false;
let devModeResult = false;

export function isSlackDevMode(): boolean {
  if (devModeChecked) return devModeResult;
  devModeResult = env.ENVIRONMENT === 'development' && getDevConfigPath() !== null;
  devModeChecked = true;
  return devModeResult;
}

export function loadSlackDevConfig(): SlackDevConfig | null {
  if (cachedConfig && Date.now() < cacheExpiresAt) {
    return cachedConfig;
  }

  const configPath = getDevConfigPath();
  if (!configPath) return null;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw) as SlackDevConfig;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cachedConfig;
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to read .slack-dev.json');
    return null;
  }
}

export function getDevDefaultAgent(config: SlackDevConfig | null): DefaultAgentConfig | null {
  if (!config?.metadata?.default_agent) return null;
  try {
    return JSON.parse(config.metadata.default_agent);
  } catch {
    return null;
  }
}

export function saveSlackDevConfig(config: SlackDevConfig): boolean {
  const configPath = getDevConfigPath();
  if (!configPath) return false;

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    cachedConfig = config;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return true;
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to write .slack-dev.json');
    return false;
  }
}
