import { exec } from 'node:child_process';
import { promisify } from 'node:util';

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
        const { stdout } = await execAsync('npm list -g @inkeep/agents-cli --depth=0');
        if (stdout.includes('@inkeep/agents-cli')) {
          return 'npm';
        }
      } else if (manager === 'pnpm') {
        const { stdout } = await execAsync('pnpm list -g @inkeep/agents-cli --depth=0');
        if (stdout.includes('@inkeep/agents-cli')) {
          return 'pnpm';
        }
      } else if (manager === 'bun') {
        const { stdout } = await execAsync('bun pm ls -g');
        if (stdout.includes('@inkeep/agents-cli')) {
          return 'bun';
        }
      } else if (manager === 'yarn') {
        const { stdout } = await execAsync('yarn global list');
        if (stdout.includes('@inkeep/agents-cli')) {
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
  packageName = '@inkeep/agents-cli'
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
  const command = getUpdateCommand(manager);
  await execAsync(command);
}
