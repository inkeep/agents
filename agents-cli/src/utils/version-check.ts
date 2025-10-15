import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The default package name for version checks and updates
 */
export const DEFAULT_PACKAGE_NAME = '@inkeep/agents-cli';

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
export async function getLatestVersion(packageName = DEFAULT_PACKAGE_NAME): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch latest version: ${response.statusText}`);
    }
    const data = await response.json();
    return data.version;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Unable to check for updates: Request timed out after 10 seconds');
    }
    throw new Error(
      `Unable to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Compare two semver versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 *
 * Note: This is a simplified semver comparison that handles basic major.minor.patch versions.
 * It does NOT handle pre-release versions (e.g., 1.0.0-beta.1) or build metadata (e.g., 1.0.0+build.1).
 * Pre-release tags and build metadata will be stripped before comparison.
 *
 * For the Inkeep CLI use case, this is sufficient as we only publish stable releases.
 */
export function compareVersions(v1: string, v2: string): number {
  // Strip pre-release and build metadata for comparison
  // Examples: "1.0.0-beta.1" -> "1.0.0", "1.0.0+build.1" -> "1.0.0"
  const cleanV1 = v1.split('-')[0].split('+')[0];
  const cleanV2 = v2.split('-')[0].split('+')[0];

  const parts1 = cleanV1.split('.').map(Number);
  const parts2 = cleanV2.split('.').map(Number);

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
export function getChangelogUrl(): string {
  return `https://github.com/inkeep/agents/blob/main/agents-cli/CHANGELOG.md`;
}
