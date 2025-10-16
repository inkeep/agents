import chalk from 'chalk';
import { checkForUpdate } from './version-check';

/**
 * Perform a non-blocking version check and display a warning if an update is available
 * This function runs in the background and will not block command execution
 */
export function performBackgroundVersionCheck(): void {
  // Run version check asynchronously without blocking
  checkForUpdate()
    .then((versionInfo) => {
      if (versionInfo.needsUpdate) {
        // Display warning message
        console.log(
          chalk.yellow(
            `\n⚠️  A new version of @inkeep/agents-cli is available: ${versionInfo.latest} (current: ${versionInfo.current})`
          )
        );
        console.log(chalk.gray('   Run `inkeep update` to upgrade to the latest version\n'));
      }
    })
    .catch(() => {
      // Silently fail if version check fails - we don't want to interrupt the user's workflow
      // No error message is displayed to avoid confusion
    });
}
