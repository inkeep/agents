import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';

/**
 * Dynamically imports a file with TypeScript support
 * Registers tsx loader for .ts files automatically
 */
export async function importWithTypeScriptSupport(filePath: string): Promise<any> {
  const ext = extname(filePath);

  // For TypeScript files, register tsx loader
  if (ext === '.ts') {
    try {
      const unregister = register();

      try {
        // Import the TypeScript file
        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(fileUrl);
        return module;
      } finally {
        // Clean up the registration
        unregister();
      }
    } catch (error) {
      // Check if this is a tsx registration error vs a module execution error
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('Dynamic require') ||
        errorMessage.includes('tsx') ||
        errorMessage.includes('register')
      ) {
        throw new Error(
          `Failed to load TypeScript file ${filePath}. ` +
            `Make sure tsx is installed: ${errorMessage}`
        );
      }

      // If it's not a tsx-related error, it's likely an error from the loaded module
      // Re-throw the original error to preserve the actual issue
      throw error;
    }
  }

  // For JavaScript files, import directly
  const fileUrl = pathToFileURL(filePath).href;
  return await import(fileUrl);
}
