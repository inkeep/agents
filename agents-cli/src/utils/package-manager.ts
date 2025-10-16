import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_PACKAGE_NAME } from './version-check';

const execAsync = promisify(exec);

export type PackageManager = 'npm' | 'pnpm' | 'bun' | 'yarn';

/**
 * Detect which package manager was used to install the CLI globally
 */
export async function detectPackageManager(): Promise<PackageManager | null> {
  const managers: PackageManager[] = ['pnpm', 'bun', 'npm', 'yarn'];

  for (const manager of managers) {
    try {
      if (manager === 'npm') {
        const { stdout } = await execAsync(`npm list -g ${DEFAULT_PACKAGE_NAME} --depth=0`);
        if (stdout.includes(DEFAULT_PACKAGE_NAME)) {
          return 'npm';
        }
      } else if (manager === 'pnpm') {
        const { stdout } = await execAsync(`pnpm list -g ${DEFAULT_PACKAGE_NAME} --depth=0`);
        if (stdout.includes(DEFAULT_PACKAGE_NAME)) {
          return 'pnpm';
        }
      } else if (manager === 'bun') {
        const { stdout } = await execAsync('bun pm ls -g');
        if (stdout.includes(DEFAULT_PACKAGE_NAME)) {
          return 'bun';
        }
      } else if (manager === 'yarn') {
        const { stdout } = await execAsync('yarn global list');
        if (stdout.includes(DEFAULT_PACKAGE_NAME)) {
          return 'yarn';
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Get the update command for a specific package manager
 */
export function getUpdateCommand(
  manager: PackageManager,
  packageName = DEFAULT_PACKAGE_NAME
): string {
  switch (manager) {
    case 'npm':
      return `npm install -g ${packageName}@latest`;
    case 'pnpm':
      return `pnpm add -g ${packageName}@latest`;
    case 'bun':
      return `bun add -g ${packageName}@latest`;
    case 'yarn':
      return `yarn global add ${packageName}@latest`;
  }
}

/**
 * Execute update command
 */
export async function executeUpdate(manager: PackageManager): Promise<void> {
  // Validate that the manager is one of the allowed values
  const allowedManagers: readonly PackageManager[] = ['npm', 'pnpm', 'bun', 'yarn'] as const;
  if (!allowedManagers.includes(manager)) {
    throw new Error(`Unsupported package manager: ${manager}`);
  }

  const command = getUpdateCommand(manager);
  await execAsync(command);
}
