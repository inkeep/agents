import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { importWithTypeScriptSupport } from './tsx-loader';

/**
 * Load environment credentials from the environments directory
 * @param projectDir - Path to the project directory
 * @param env - Environment name (e.g., 'development', 'production')
 * @returns Object containing credentials or null if not found
 */
export async function loadEnvironmentCredentials(
  projectDir: string,
  env: string
): Promise<any | null> {
  const environmentsDir = join(projectDir, 'environments');
  const envFilePath = join(environmentsDir, `${env}.env.ts`);

  if (!existsSync(envFilePath)) {
    throw new Error(
      `Environment file not found: ${envFilePath}\n` +
        `Make sure you have a ${env}.env.ts file in the environments directory.`
    );
  }

  try {
    const envModule = await importWithTypeScriptSupport(envFilePath);

    // Get the first export (should be the environment settings)
    const exports = Object.keys(envModule);
    if (exports.length === 0) {
      throw new Error(`No exports found in environment file: ${envFilePath}`);
    }

    // Get the first export
    const firstExportKey = exports[0];
    const envSettings = envModule[firstExportKey];

    if (!envSettings || typeof envSettings !== 'object') {
      throw new Error(
        `Invalid environment settings in ${envFilePath}. Expected an object with credentials.`
      );
    }

    // Return the credentials from the environment settings
    return envSettings.credentials || {};
  } catch (error: any) {
    throw new Error(`Failed to load environment file ${envFilePath}: ${error.message}`);
  }
}
