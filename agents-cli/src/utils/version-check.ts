import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface VersionInfo {
  current: string;
  latest: string;
  needsUpdate: boolean;
}

/**
 * Get the current installed version from package.json
 */
export function getCurrentVersion(): string {
  // Try going up one level first (for bundled dist/index.js)
  let packageJsonPath = join(__dirname, '..', 'package.json');

  // If not found, try going up two levels (for source files in src/utils/)
  if (!existsSync(packageJsonPath)) {
    packageJsonPath = join(__dirname, '..', '..', 'package.json');
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

/**
 * Fetch the latest version from npm registry
 */
export async function getLatestVersion(packageName = '@inkeep/agents-cli'): Promise<string> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    if (!response.ok) {
      throw new Error(`Failed to fetch latest version: ${response.statusText}`);
    }
    const data = await response.json();
    return data.version;
  } catch (error) {
    throw new Error(
      `Unable to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Compare two semver versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }

  return 0;
}

/**
 * Check if an update is available
 */
export async function checkForUpdate(): Promise<VersionInfo> {
  const current = getCurrentVersion();
  const latest = await getLatestVersion();
  const needsUpdate = compareVersions(current, latest) < 0;

  return {
    current,
    latest,
    needsUpdate,
  };
}

/**
 * Get the changelog URL for the package
 */
export function getChangelogUrl(_packageName = '@inkeep/agents-cli'): string {
  return `https://github.com/inkeep/agents/blob/main/agents-cli/CHANGELOG.md`;
}
