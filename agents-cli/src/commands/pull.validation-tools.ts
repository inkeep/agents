import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import { compareProjectDefinitions, formatDifferencesReport } from './pull.json-diff';
import { restorePlaceholders } from './pull.placeholder-system';

/**
 * Context needed for validation tools
 */
export interface ValidationContext {
  originalProjectDefinition: FullProjectDefinition;
  projectId: string;
  generatedFiles: Map<string, string>; // path -> content (may contain placeholders)
  placeholderReplacements: Record<string, string>; // placeholder -> original value
  tenantId: string;
  apiUrl: string;
  projectRoot: string; // project root directory to make paths relative
  debug?: boolean;
}

/**
 * Result from validation
 */
export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  differencesCount: number;
  regeneratedDefinition?: FullProjectDefinition;
}

/**
 * Create validation tool for the LLM to use
 * This tool validates generated TypeScript code by:
 * 1. Writing files to a temp directory
 * 2. Loading the project using dynamic import
 * 3. Calling project.getFullDefinition()
 * 4. Comparing the result with the original API response
 */
export function createValidationTool(context: ValidationContext): CoreTool {
  return tool({
    description: `Validates that the generated TypeScript code correctly represents the project definition.
This tool:
1. Writes all generated files to a temporary directory
2. Loads the project TypeScript code
3. Converts it back to JSON using project.getFullDefinition()
4. Compares the regenerated JSON with the original API response
5. Returns any differences found (missing fields, incorrect values, etc.)

Call this tool after generating code to verify it's correct. If there are errors, regenerate the problematic files.`,
    inputSchema: z.object({
      reason: z
        .string()
        .describe('Why you want to validate (e.g., "checking if initial generation is correct")'),
    }),
    execute: async ({ reason }) => {
      if (context.debug) {
        console.log(`\n[DEBUG] Validation tool called: ${reason}`);
      }

      try {
        const result = await validateGeneratedFiles(context);

        if (context.debug) {
          console.log(`[DEBUG] Validation result: ${result.success ? 'PASS' : 'FAIL'}`);
          console.log(`[DEBUG] Differences found: ${result.differencesCount}`);
        }

        // Return a formatted response for the LLM
        if (result.success) {
          return {
            success: true,
            message: '✅ Validation passed! Generated code correctly represents the project definition.',
          };
        }

        return {
          success: false,
          message: `❌ Validation failed with ${result.differencesCount} differences.`,
          errors: result.errors,
          warnings: result.warnings,
          details:
            'Review the errors above and regenerate the affected files. Focus on ensuring all IDs, names, and configurations match exactly.',
        };
      } catch (error) {
        if (context.debug) {
          console.error('[DEBUG] Validation error:', error);
        }

        return {
          success: false,
          message: '❌ Validation failed with an error',
          error: error instanceof Error ? error.message : String(error),
          details:
            'An error occurred during validation. This usually means the generated code has syntax errors or cannot be loaded.',
        };
      }
    },
  });
}

/**
 * Create lint tool (placeholder for future implementation)
 */
export function createLintTool(): CoreTool {
  return tool({
    description:
      'Runs linting checks on generated code (not yet implemented). Reserved for future use.',
    inputSchema: z.object({
      reason: z.string().describe('Why you want to lint'),
    }),
    execute: async ({ reason }) => {
      return {
        success: true,
        message: 'Linting is not yet implemented',
        note: 'This tool is reserved for future use',
      };
    },
  });
}

/**
 * Validate generated files by loading them and comparing with original definition
 */
async function validateGeneratedFiles(context: ValidationContext): Promise<ValidationResult> {
  // Create a temporary directory for validation
  const tempDir = join(tmpdir(), `inkeep-validation-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Write all files to temp directory with placeholders restored
    for (const [absolutePath, content] of context.generatedFiles.entries()) {
      // Convert absolute path to relative by removing project root
      const relativePath = absolutePath.startsWith(context.projectRoot)
        ? absolutePath.slice(context.projectRoot.length).replace(/^\//, '')
        : absolutePath;

      const fullPath = join(tempDir, relativePath);

      // Ensure directory exists
      const dir = join(fullPath, '..');
      mkdirSync(dir, { recursive: true });

      // Restore placeholders in the content
      const restoredContent = restorePlaceholders(content, context.placeholderReplacements);

      // Write the file
      writeFileSync(fullPath, restoredContent, 'utf-8');

      if (context.debug) {
        console.log(`[DEBUG] Wrote validation file: ${fullPath}`);
      }
    }

    // Now try to load the project and get its definition
    const indexPath = join(tempDir, 'index.ts');

    if (context.debug) {
      console.log(`[DEBUG] Loading project from: ${indexPath}`);
    }

    // Dynamically import the project file using tsx loader
    // Note: This requires tsx to be installed as a dependency
    const { Project } = await import('@inkeep/agents-sdk');

    // Use tsx to load and execute the TypeScript file
    // We need to use a worker or subprocess to load TypeScript in a clean environment
    // For now, we'll use a simpler approach with require and tsx
    const { register } = await import('tsx/esm/api');
    const unregister = register();

    let projectModule: any;
    try {
      // Import the generated index file
      projectModule = await import(`${indexPath}?t=${Date.now()}`);
    } finally {
      unregister();
    }

    // Find the exported project instance
    let projectInstance: any = null;
    for (const exportName of Object.keys(projectModule)) {
      const exported = projectModule[exportName];
      if (exported && typeof exported === 'object' && exported.__type === 'project') {
        projectInstance = exported;
        break;
      }
    }

    if (!projectInstance) {
      return {
        success: false,
        errors: ['No project instance found in generated index.ts. Expected an exported project() call.'],
        warnings: [],
        differencesCount: 1,
      };
    }

    // Set config on the project
    projectInstance.setConfig(context.tenantId, context.apiUrl);

    // Get the full definition from the regenerated code
    const regeneratedDefinition = await projectInstance.getFullDefinition();

    if (context.debug) {
      console.log('[DEBUG] Successfully regenerated project definition from TypeScript');
    }

    // Compare the regenerated definition with the original
    const differences = compareProjectDefinitions(
      context.originalProjectDefinition,
      regeneratedDefinition
    );

    if (differences.length === 0) {
      return {
        success: true,
        errors: [],
        warnings: [],
        differencesCount: 0,
        regeneratedDefinition,
      };
    }

    // Format the differences into error messages
    const report = formatDifferencesReport(differences);

    return {
      success: false,
      errors: [report],
      warnings: [],
      differencesCount: differences.length,
      regeneratedDefinition,
    };
  } catch (error) {
    if (context.debug) {
      console.error('[DEBUG] Error during validation:', error);
    }

    // Return a detailed error
    const errorMessage =
      error instanceof Error
        ? `${error.message}\n\nStack trace:\n${error.stack}`
        : String(error);

    return {
      success: false,
      errors: [`Failed to load or validate generated code: ${errorMessage}`],
      warnings: [],
      differencesCount: 1,
    };
  }
}

/**
 * Get all validation tools
 */
export function getValidationTools(context: ValidationContext): Record<string, CoreTool> {
  return {
    validate_generated_code: createValidationTool(context),
    lint_code: createLintTool(),
  };
}
