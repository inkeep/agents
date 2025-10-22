import { writeFileSync } from 'node:fs';
import type { FullProjectDefinition, ModelSettings } from '@inkeep/agents-core';
import { generateText, stepCountIs } from 'ai';
import { isLangfuseConfigured } from '../instrumentation';
import {
  cleanGeneratedCode,
  createModel,
  getTypeDefinitions,
  IMPORT_INSTRUCTIONS,
  NAMING_CONVENTION_RULES,
  PROJECT_JSON_EXAMPLE,
} from './pull.llm-generate';
import {
  calculateTokenSavings,
  createPlaceholders,
  restorePlaceholders,
} from './pull.placeholder-system';
import type { ValidationContext } from './pull.validation-tools';
import { getValidationTools } from './pull.validation-tools';

/**
 * Specification for a file to generate
 */
export interface FileSpec {
  type: 'index' | 'agent' | 'tool' | 'data_component' | 'artifact_component' | 'status_component';
  id: string;
  data: any;
  outputPath: string;
  variableName?: string; // Variable name to use for export (for individual entity files)
  toolFilenames?: Map<string, string>;
  componentFilenames?: Map<string, string>;
  toolVariableNames?: Map<string, string>;
  componentVariableNames?: Map<string, string>;
}

/**
 * Options for batch generation with validation
 */
export interface BatchGenerationOptions {
  fileSpecs: FileSpec[];
  modelSettings: ModelSettings;
  originalProjectDefinition: FullProjectDefinition;
  projectId: string;
  projectRoot: string;
  tenantId: string;
  apiUrl: string;
  maxAttempts?: number;
  debug?: boolean;
  reasoningConfig?: Record<string, any>;
}

/**
 * Result from batch generation
 */
export interface BatchGenerationResult {
  success: boolean;
  attemptCount: number;
  validationPassed: boolean;
  filesGenerated: number;
  errors: string[];
  warnings: string[];
}

/**
 * Generate all files in a batch with iterative validation
 * Uses LLM function calling to allow self-correction
 */
export async function generateAllFilesWithValidation(
  options: BatchGenerationOptions
): Promise<BatchGenerationResult> {
  const {
    fileSpecs,
    modelSettings,
    originalProjectDefinition,
    projectId,
    projectRoot,
    tenantId,
    apiUrl,
    maxAttempts = 3,
    debug = false,
    reasoningConfig,
  } = options;

  if (fileSpecs.length === 0) {
    return {
      success: true,
      attemptCount: 0,
      validationPassed: true,
      filesGenerated: 0,
      errors: [],
      warnings: [],
    };
  }

  if (debug) {
    console.log(`\n[DEBUG] === Starting batch generation with validation ===`);
    console.log(`[DEBUG] Files to generate: ${fileSpecs.length}`);
    console.log(`[DEBUG] Max attempts: ${maxAttempts}`);
    console.log(`[DEBUG] Model: ${modelSettings.model || 'default'}`);
  }

  const model = createModel(modelSettings);

  // Create placeholders for all file data to reduce token usage
  const fileDataWithPlaceholders = fileSpecs.map((spec) => {
    const { processedData, replacements } = createPlaceholders(spec.data, { fileType: spec.type });
    return {
      spec,
      processedData,
      replacements,
    };
  });

  // Merge all placeholder replacements
  const allReplacements: Record<string, string> = {};
  for (const { replacements } of fileDataWithPlaceholders) {
    Object.assign(allReplacements, replacements);
  }

  if (debug) {
    const totalReplacements = Object.keys(allReplacements).length;
    console.log(`[DEBUG] Created ${totalReplacements} placeholders across all files`);

    // Calculate total token savings
    let originalSize = 0;
    let processedSize = 0;
    for (const { spec, processedData } of fileDataWithPlaceholders) {
      originalSize += JSON.stringify(spec.data).length;
      processedSize += JSON.stringify(processedData).length;
    }
    const savings = calculateTokenSavings(
      { size: originalSize } as any,
      { size: processedSize } as any
    );
    console.log(
      `[DEBUG] Total token savings: ${savings.savings} characters (${savings.savingsPercentage.toFixed(1)}%)`
    );
  }

  // Build the initial prompt
  const prompt = buildBatchGenerationPrompt(fileDataWithPlaceholders);

  if (debug) {
    console.log(`[DEBUG] Initial prompt size: ${prompt.length} characters`);
  }

  // Track generated files across attempts
  const generatedFiles = new Map<string, string>();
  let lastValidationErrors: string[] = [];
  let validationPassed = false;
  let attemptCount = 0;

  // Create validation context
  const validationContext: ValidationContext = {
    originalProjectDefinition,
    projectId,
    generatedFiles,
    placeholderReplacements: allReplacements,
    projectRoot,
    tenantId,
    apiUrl,
    debug,
  };

  // Get validation tools
  const tools = getValidationTools(validationContext);

  // Iterative generation loop
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount = attempt;

    if (debug) {
      console.log(`\n[DEBUG] === Attempt ${attempt} of ${maxAttempts} ===`);
    }

    try {
      // Build the prompt for this attempt
      const attemptPrompt =
        attempt === 1
          ? prompt
          : buildRetryPrompt(prompt, lastValidationErrors, attempt, maxAttempts);

      if (debug && attempt > 1) {
        console.log(`[DEBUG] Retry prompt includes ${lastValidationErrors.length} previous errors`);
      }

      // Generate with tools enabled
      const startTime = Date.now();

      const result = await generateText({
        model,
        prompt: attemptPrompt,
        temperature: 0.1,
        stopWhen: stepCountIs(5), // Allow multiple tool calls
        maxOutputTokens: 32000,
        abortSignal: AbortSignal.timeout(600000), // 10 minute timeout
        tools,
        ...reasoningConfig,
        // Enable Langfuse telemetry if configured
        ...(isLangfuseConfigured() && {
          experimental_telemetry: {
            isEnabled: true,
            metadata: {
              batchGeneration: true,
              withValidation: true,
              attempt,
              maxAttempts,
              fileCount: fileSpecs.length,
              promptSize: attemptPrompt.length,
            },
          },
        }),
      });

      const duration = Date.now() - startTime;

      if (debug) {
        console.log(`[DEBUG] LLM response received in ${duration}ms`);
        console.log(`[DEBUG] Response text length: ${result.text.length} characters`);
        console.log(`[DEBUG] Tool calls made: ${result.steps.length - 1}`); // -1 for initial generation
      }

      // Parse the generated files from the response
      const parsedFiles = parseMultiFileResponse(result.text, fileSpecs);

      if (debug) {
        console.log(`[DEBUG] Parsed ${parsedFiles.length} files from response`);
      }

      // Update generated files map
      // Only clear if we successfully parsed files, to preserve previous attempts
      if (parsedFiles.length > 0) {
        generatedFiles.clear();
        for (const { path, content } of parsedFiles) {
          generatedFiles.set(path, content);
        }
      }

      // Check if validation tool was called
      const validationStep = result.steps.find((step) =>
        step.toolCalls?.some((call: any) => call.toolName === 'validate_generated_code')
      );

      if (validationStep) {
        if (debug) {
          console.log('[DEBUG] LLM called validation tool during generation');
        }

        // Get the validation result from tool results
        const validationToolResult = result.steps
          .flatMap((step) => step.toolResults || [])
          .find((toolResult: any) => toolResult.toolName === 'validate_generated_code');

        if (validationToolResult) {
          // The result might be in .result or directly on the tool result
          const toolOutput = validationToolResult.result || validationToolResult;

          if (debug) {
            console.log(`[DEBUG] Validation tool output:`, JSON.stringify(toolOutput, null, 2));
          }

          if (toolOutput && toolOutput.success) {
            if (debug) {
              console.log('[DEBUG] Validation passed!');
            }
            validationPassed = true;
            break;
          }

          if (toolOutput && toolOutput.success === false) {
            if (debug) {
              console.log('[DEBUG] Validation failed, preparing for retry');
            }
            lastValidationErrors = toolOutput.errors || [];

            // If this is the last attempt, break
            if (attempt === maxAttempts) {
              if (debug) {
                console.log('[DEBUG] Max attempts reached, using last generation');
              }
              break;
            }
          }
        }
      } else {
        if (debug) {
          console.log('[DEBUG] LLM did not call validation tool, assuming success');
        }
        // If LLM didn't call validation, we assume success
        validationPassed = true;
        break;
      }
    } catch (error) {
      if (debug) {
        console.error(`[DEBUG] Error during attempt ${attempt}:`, error);
      }

      // Store the error for the next attempt or final result
      lastValidationErrors = [error instanceof Error ? error.message : String(error)];

      // If this is the last attempt, break and use whatever files we have
      if (attempt === maxAttempts) {
        if (debug) {
          console.log('[DEBUG] Max attempts reached after error, using best available generation');
        }
        break;
      }
    }
  }

  // Check if we have any files to write
  if (generatedFiles.size === 0) {
    return {
      success: false,
      attemptCount,
      validationPassed: false,
      filesGenerated: 0,
      errors: ['No files were successfully generated after all attempts'],
      warnings: lastValidationErrors.length > 0 ? ['Last errors:', ...lastValidationErrors] : [],
    };
  }

  // Write all generated files to disk with placeholders restored
  if (debug) {
    console.log(`\n[DEBUG] Writing ${generatedFiles.size} files to disk`);
  }

  for (const [path, content] of generatedFiles.entries()) {
    // Restore placeholders
    const restoredContent = restorePlaceholders(content, allReplacements);
    const cleanedContent = cleanGeneratedCode(restoredContent);

    writeFileSync(path, cleanedContent, 'utf-8');

    if (debug) {
      console.log(`[DEBUG] Wrote file: ${path}`);
    }
  }

  // Prepare result
  const warnings: string[] = [];
  if (!validationPassed) {
    warnings.push(
      `Validation did not pass after ${attemptCount} attempts. Using best effort generation.`
    );
    if (lastValidationErrors.length > 0) {
      warnings.push('Last validation errors:');
      warnings.push(...lastValidationErrors);
    }
  }

  if (debug) {
    console.log(`[DEBUG] === Batch generation completed ===`);
    console.log(`[DEBUG] Attempts: ${attemptCount}`);
    console.log(`[DEBUG] Validation passed: ${validationPassed}`);
    console.log(`[DEBUG] Files generated: ${generatedFiles.size}`);
  }

  return {
    success: true,
    attemptCount,
    validationPassed,
    filesGenerated: generatedFiles.size,
    errors: [],
    warnings,
  };
}

/**
 * Build the initial batch generation prompt
 */
function buildBatchGenerationPrompt(
  fileDataWithPlaceholders: Array<{
    spec: FileSpec;
    processedData: any;
    replacements: Record<string, string>;
  }>
): string {
  const typeDefinitions = getTypeDefinitions();
  const sharedInstructions = `
${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}
`;

  // Build individual file prompts
  const filePrompts = fileDataWithPlaceholders.map(({ spec, processedData }, index) => {
    let fileSpecificInstructions = '';

    switch (spec.type) {
      case 'index': {
        // Build variable name mappings info
        let variableNamesInfo = '';
        if (spec.toolVariableNames && spec.toolVariableNames.size > 0) {
          variableNamesInfo += '\nTOOL VARIABLE NAMES (use these for imports):\n';
          for (const [id, variableName] of spec.toolVariableNames.entries()) {
            variableNamesInfo += `- Tool ID "${id}" should be imported as: ${variableName}\n`;
          }
        }
        if (spec.componentVariableNames && spec.componentVariableNames.size > 0) {
          variableNamesInfo += '\nCOMPONENT VARIABLE NAMES (use these for imports):\n';
          for (const [id, variableName] of spec.componentVariableNames.entries()) {
            variableNamesInfo += `- Component ID "${id}" should be imported as: ${variableName}\n`;
          }
        }

        fileSpecificInstructions = `
REQUIREMENTS FOR INDEX FILE:
1. Import the project function from '@inkeep/agents-sdk'
2. The project object should include all required properties
3. Export the project instance
4. CRITICAL: Use the variable names specified below for imports, NOT the tool/component IDs
${variableNamesInfo}

EXAMPLE:
${PROJECT_JSON_EXAMPLE}
`;
        break;
      }

      case 'agent': {
        // Build variable name mappings info for agents
        let agentVariableNamesInfo = '';
        if (spec.toolVariableNames && spec.toolVariableNames.size > 0) {
          agentVariableNamesInfo += '\nTOOL VARIABLE NAMES (use these for imports):\n';
          for (const [id, variableName] of spec.toolVariableNames.entries()) {
            agentVariableNamesInfo += `- Tool ID "${id}" should be imported as: ${variableName}\n`;
          }
        }
        if (spec.componentVariableNames && spec.componentVariableNames.size > 0) {
          agentVariableNamesInfo += '\nCOMPONENT VARIABLE NAMES (use these for imports):\n';
          for (const [id, variableName] of spec.componentVariableNames.entries()) {
            agentVariableNamesInfo += `- Component ID "${id}" should be imported as: ${variableName}\n`;
          }
        }

        fileSpecificInstructions = `
REQUIREMENTS FOR AGENT FILE:
1. Import { agent, subAgent } from '@inkeep/agents-sdk'
2. Import tools and components from their respective files
3. Use proper TypeScript types and Zod schemas
4. Use template literals for all string values
5. Define contextConfig using helper functions if needed
6. CRITICAL: Use the variable names specified below for imports, NOT the tool/component IDs
${agentVariableNamesInfo}
`;
        break;
      }

      case 'tool':
        fileSpecificInstructions = `
REQUIREMENTS FOR TOOL FILE:
1. Import mcpTool from '@inkeep/agents-sdk'
2. Include serverUrl property
3. Add credential if credentialReferenceId exists
4. CRITICAL: Export this tool with the variable name: ${spec.variableName || spec.id}
   Example: export const ${spec.variableName || spec.id} = mcpTool({ ... });
`;
        break;

      case 'data_component':
        fileSpecificInstructions = `
REQUIREMENTS FOR DATA COMPONENT:
1. Import dataComponent from '@inkeep/agents-sdk'
2. Import z from 'zod'
3. Define clean Zod schemas
4. CRITICAL: Export this component with the variable name: ${spec.variableName || spec.id}
   Example: export const ${spec.variableName || spec.id} = dataComponent({ ... });
`;
        break;

      case 'artifact_component':
        fileSpecificInstructions = `
REQUIREMENTS FOR ARTIFACT COMPONENT:
1. Import artifactComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' and preview from '@inkeep/agents-core'
3. Use preview() for fields shown in previews
4. CRITICAL: Export this component with the variable name: ${spec.variableName || spec.id}
   Example: export const ${spec.variableName || spec.id} = artifactComponent({ ... });
`;
        break;

      case 'status_component':
        fileSpecificInstructions = `
REQUIREMENTS FOR STATUS COMPONENT:
1. Import statusComponent from '@inkeep/agents-sdk'
2. Import z from 'zod'
3. Use 'type' field as identifier
4. CRITICAL: Export this component with the variable name: ${spec.variableName || spec.id}
   Example: export const ${spec.variableName || spec.id} = statusComponent({ ... });
`;
        break;
    }

    return `
--- FILE ${index + 1} OF ${fileDataWithPlaceholders.length}: ${spec.outputPath} ---
FILE TYPE: ${spec.type}
FILE ID: ${spec.id}

DATA FOR THIS FILE:
${JSON.stringify(processedData, null, 2)}

${fileSpecificInstructions}

Generate ONLY the TypeScript code for this file.
--- END FILE ${index + 1} ---
`;
  });

  return `You are generating multiple TypeScript files for an Inkeep project.

${typeDefinitions}

${sharedInstructions}

CRITICAL INSTRUCTIONS:
1. Generate ${fileDataWithPlaceholders.length} separate TypeScript files
2. Each file MUST be wrapped with separator markers: --- FILE: <path> --- and --- END FILE: <path> ---
3. Include ONLY raw TypeScript code between markers (no markdown)
4. After generating all files, call the validate_generated_code tool to verify correctness
5. If validation fails, regenerate the problematic files and validate again
6. Continue until validation passes or you've made reasonable attempts

FILE SPECIFICATIONS:
${filePrompts.join('\n\n')}

OUTPUT FORMAT:
--- FILE: /path/to/file.ts ---
[TypeScript code here]
--- END FILE: /path/to/file.ts ---

Now generate all files and validate them using the validate_generated_code tool.`;
}

/**
 * Build a retry prompt with previous validation errors
 */
function buildRetryPrompt(
  originalPrompt: string,
  validationErrors: string[],
  attempt: number,
  maxAttempts: number
): string {
  return `${originalPrompt}

RETRY CONTEXT - ATTEMPT ${attempt} OF ${maxAttempts}:
Previous generation had validation errors. Please fix these issues:

${validationErrors.join('\n\n')}

IMPORTANT:
- Focus on the specific errors mentioned above
- Ensure all IDs, names, and configurations match exactly
- Double-check the structure of the generated code
- Call validate_generated_code after regenerating to verify

Now regenerate the files with these fixes applied.`;
}

/**
 * Parse multi-file response from LLM
 */
function parseMultiFileResponse(
  response: string,
  fileSpecs: FileSpec[]
): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = [];

  for (const spec of fileSpecs) {
    const startMarker = `--- FILE: ${spec.outputPath} ---`;
    const endMarker = `--- END FILE: ${spec.outputPath} ---`;

    const startIndex = response.indexOf(startMarker);
    const endIndex = response.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
      // Try alternate format without full path
      const altStartMarker = `--- FILE ${fileSpecs.indexOf(spec) + 1}`;
      const altEndMarker = `--- END FILE ${fileSpecs.indexOf(spec) + 1}`;

      const altStartIndex = response.indexOf(altStartMarker);
      const altEndIndex = response.indexOf(altEndMarker);

      if (altStartIndex !== -1 && altEndIndex !== -1) {
        const content = response
          .substring(altStartIndex + altStartMarker.length, altEndIndex)
          .trim();
        results.push({ path: spec.outputPath, content });
        continue;
      }

      throw new Error(`Failed to find file markers for ${spec.outputPath}`);
    }

    const content = response.substring(startIndex + startMarker.length, endIndex).trim();

    results.push({
      path: spec.outputPath,
      content,
    });
  }

  return results;
}
