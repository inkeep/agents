/**
 * Hybrid generator - combines deterministic generation with LLM integration
 *
 * This approach generates components deterministically (fast, reliable) and then
 * uses LLM to intelligently integrate them into existing files with proper formatting.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { generateText } from 'ai';
import chalk from 'chalk';
import { createModel } from '../pull.llm-generate';
import {
  calculateTokenSavings,
  createPlaceholders,
  restorePlaceholders,
} from '../pull.placeholder-system';
import { generateAgentExport, generateAgentFile, generateAgentImports } from './agent-generator';
import {
  generateArtifactComponentExport,
  generateArtifactComponentFile,
  generateArtifactComponentImports,
} from './artifact-component-generator';
import {
  generateDataComponentExport,
  generateDataComponentFile,
  generateDataComponentImports,
} from './data-component-generator';
import { type CodeStyle, DEFAULT_CODE_STYLE } from './generator-utils';
import {
  generateStatusComponentExport,
  generateStatusComponentFile,
  generateStatusComponentImports,
} from './status-component-generator';
import { extractTokenUsage, tokenTracker } from './token-tracker';
// Import deterministic generators
import { generateToolExport, generateToolImports } from './tool-generator';

interface ComponentParts {
  imports: string[];
  exportDefinition: string;
  componentType:
    | 'tool'
    | 'dataComponent'
    | 'artifactComponent'
    | 'statusComponent'
    | 'agent'
    | 'environment';
  componentId: string;
  placeholderReplacements?: Record<string, string>;
}

interface FileIntegrationRequest {
  filePath: string;
  existingContent: string;
  componentsToAdd: ComponentParts[];
  componentsToModify: ComponentParts[];
  debug?: boolean;
  verbose?: boolean;
}

/**
 * Generate component parts deterministically (imports + export definition)
 */
export function generateComponentParts(
  componentType: 'tool' | 'dataComponent' | 'artifactComponent' | 'statusComponent' | 'agent',
  componentId: string,
  componentData: any,
  style: CodeStyle = DEFAULT_CODE_STYLE,
  project?: any,
  componentNameMap?: Map<string, { name: string; type: string }>,
  usePlaceholders: boolean = true,
  isInline: boolean = false
): ComponentParts {
  // Only create placeholders if requested (for LLM integration)
  // For deterministic generation, use the original data directly
  let processedComponentData: any;
  let replacements: Record<string, string> = {};

  if (usePlaceholders) {
    // Apply placeholders to the component data BEFORE generating TypeScript code
    // This replaces long strings (like prompts) with placeholders, but preserves the data structure
    const result = createPlaceholders(componentData, { fileType: componentType });
    processedComponentData = result.processedData;
    replacements = result.replacements;
  } else {
    // Use original data directly for deterministic generation
    processedComponentData = componentData;
  }

  let imports: string[] = [];
  let exportDefinition: string = '';

  switch (componentType) {
    case 'tool':
      imports = generateToolImports(componentId, processedComponentData, style);
      exportDefinition = generateToolExport(
        componentId,
        processedComponentData,
        style,
        componentNameMap,
        isInline
      );
      break;

    case 'dataComponent':
      imports = generateDataComponentImports(componentId, processedComponentData, style);
      exportDefinition = generateDataComponentExport(
        componentId,
        processedComponentData,
        style,
        componentNameMap
      );
      break;

    case 'artifactComponent':
      imports = generateArtifactComponentImports(componentId, processedComponentData, style);
      exportDefinition = generateArtifactComponentExport(
        componentId,
        processedComponentData,
        style,
        componentNameMap
      );
      break;

    case 'statusComponent':
      imports = generateStatusComponentImports(componentId, processedComponentData, style);
      exportDefinition = generateStatusComponentExport(
        componentId,
        processedComponentData,
        style,
        componentNameMap
      );
      break;

    case 'agent':
      if (project && componentNameMap) {
        imports = generateAgentImports(
          componentId,
          processedComponentData,
          project,
          style,
          componentNameMap
        );
        exportDefinition = generateAgentExport(
          componentId,
          processedComponentData,
          project,
          style,
          componentNameMap
        );
      } else {
        // Fallback to full file generation and extraction
        const agentFile = generateAgentFile(
          componentId,
          processedComponentData,
          project || {},
          style,
          componentNameMap || new Map()
        );
        const agentParts = extractImportsAndExport(agentFile);
        imports = agentParts.imports;
        exportDefinition = agentParts.exportDefinition;
      }
      break;

    default:
      throw new Error(`Unsupported component type: ${componentType}`);
  }

  return {
    imports,
    exportDefinition,
    componentType,
    componentId,
    placeholderReplacements: replacements, // Store replacements so we can restore them later
  };
}

/**
 * Extract imports and export from a generated file (temporary helper)
 */
function extractImportsAndExport(fileContent: string): {
  imports: string[];
  exportDefinition: string;
} {
  const lines = fileContent.split('\n');
  const imports: string[] = [];
  const exportLines: string[] = [];
  let inExport = false;
  let braceCount = 0;

  for (const line of lines) {
    if (line.trim().startsWith('import ')) {
      imports.push(line);
    } else if (line.trim().startsWith('export ')) {
      inExport = true;
      exportLines.push(line);
      braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    } else if (inExport) {
      exportLines.push(line);
      braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (braceCount <= 0 && line.includes(';')) {
        break;
      }
    }
  }

  return {
    imports,
    exportDefinition: exportLines.join('\n'),
  };
}

/**
 * Integrate components into an existing file using LLM
 */
export async function integrateComponentsIntoFile(
  request: FileIntegrationRequest
): Promise<{ success: boolean; updatedContent?: string; error?: string }> {
  const { filePath, existingContent, componentsToAdd, componentsToModify, debug } = request;

  try {
    // Collect all placeholder replacements from components BEFORE creating integration data
    const allReplacements: Record<string, string> = {};
    [...componentsToAdd, ...componentsToModify].forEach((comp) => {
      if (comp.placeholderReplacements) {
        Object.assign(allReplacements, comp.placeholderReplacements);
      }
    });

    // Generate concrete code instructions for LLM - no JSON, just actual TypeScript code
    let addInstructions = '';
    if (componentsToAdd.length > 0) {
      addInstructions = 'COMPONENTS TO ADD:\n\n';
      for (const comp of componentsToAdd) {
        addInstructions += `// Add this new ${comp.componentType}: ${comp.componentId}\n`;
        addInstructions += `${comp.imports.join('\n')}\n\n`;
        addInstructions += `${comp.exportDefinition}\n\n`;
      }
    } else {
      addInstructions = 'COMPONENTS TO ADD:\n(none)\n\n';
    }

    let modifyInstructions = '';
    if (componentsToModify.length > 0) {
      modifyInstructions = 'COMPONENTS TO REPLACE:\n\n';
      for (const comp of componentsToModify) {
        modifyInstructions += `// Replace the existing ${comp.componentType} "${comp.componentId}" with this updated version:\n`;
        modifyInstructions += `${comp.imports.join('\n')}\n\n`;
        modifyInstructions += `${comp.exportDefinition}\n\n`;
      }
    } else {
      modifyInstructions = 'COMPONENTS TO REPLACE:\n(none)\n\n';
    }

    const promptTemplate = createFileIntegrationTemplate(filePath);

    // Call LLM with proven settings from existing pull command
    const startTime = Date.now();
    const model = createModel({
      model: process.env.INKEEP_LLM_MODEL,
    });

    const { generateText } = await import('ai');

    // Build prompt with concrete code instructions instead of JSON
    const prompt = promptTemplate
      .replace('{{EXISTING_CONTENT}}', existingContent)
      .replace('{{ADD_INSTRUCTIONS}}', addInstructions)
      .replace('{{MODIFY_INSTRUCTIONS}}', modifyInstructions);

    const response = await generateText({
      model,
      prompt,
      temperature: 0.1, // Low temperature for consistent code
      maxOutputTokens: 16000, // Large enough for complex files
      abortSignal: AbortSignal.timeout(60000), // 60 second timeout
    });

    const duration = Date.now() - startTime;
    const generatedContent = response.text;

    // Track token usage
    const usage = extractTokenUsage(response);
    if (usage) {
      tokenTracker.recordCall('hybrid-integration', usage, duration);
    }

    // Restore placeholders using our custom system
    const restoredContent =
      Object.keys(allReplacements).length > 0
        ? restorePlaceholders(generatedContent, allReplacements)
        : generatedContent;

    // Clean the generated content
    const cleanedContent = cleanGeneratedCode(restoredContent);

    // Don't write to file - let temp validation system handle file writing
    // This prevents overwriting real files before validation

    return {
      success: true,
      updatedContent: cleanedContent,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create file integration template with concrete code instructions
 */
function createFileIntegrationTemplate(filePath: string): string {
  return `You are a TypeScript file integrator. Your job is to integrate the provided TypeScript code into the existing file, following the specific instructions below.

EXISTING FILE CONTENT:
{{EXISTING_CONTENT}}

{{ADD_INSTRUCTIONS}}

{{MODIFY_INSTRUCTIONS}}

INTEGRATION INSTRUCTIONS:
1. **Minimal surgical changes**: Only modify what's specifically requested - preserve existing code structure, ordering, and style
2. **Git-friendly diffs**: Make targeted changes that result in clean, minimal git diffs that clearly show what functionality changed
3. **Preserve existing code organization**: Keep the same import order, component order, and spacing patterns as the existing file
4. **Smart import management**: Merge import statements intelligently (no duplicates, maintain alphabetical order within groups)
5. **Use the provided code exactly**: The new/modified components were generated deterministically - use them EXACTLY as provided
6. **Maintain consistent formatting**: Match existing indentation, quote style, semicolon usage, and line spacing
7. **Clean Zod schemas**: When working with Zod schemas, use clean patterns like \`\`\`.nullable()\`\`\` instead of \`\`\`z.union([z.string(), z.null()])\`\`\`

CRITICAL RULES:
- DO NOT reorder existing components unless necessary for functionality
- DO NOT reformat existing code that isn't being modified
- DO NOT change variable names, imports, or structure of existing components
- DO NOT add unnecessary whitespace changes
- ONLY modify the specific components mentioned in the instructions
- PRESERVE all comments, existing formatting, and code style patterns

OUTPUT FORMAT:
Return ONLY the complete updated TypeScript file content (no markdown, no explanations).`;
}

/**
 * Clean generated code (same as existing pull command)
 */
function cleanGeneratedCode(generatedCode: string): string {
  // Remove markdown code block wrapping
  let cleaned = generatedCode.replace(/^```(?:typescript|ts)?\s*\n/gm, '');
  cleaned = cleaned.replace(/\n```\s*$/gm, '');

  // Remove leading/trailing whitespace but preserve internal formatting
  cleaned = cleaned.trim();

  // Ensure file ends with newline
  if (!cleaned.endsWith('\n')) {
    cleaned += '\n';
  }

  return cleaned;
}

/**
 * Batch process multiple file integrations
 */
export async function batchIntegrateComponents(
  fileIntegrations: FileIntegrationRequest[],
  debug: boolean = false
): Promise<{
  successful: number;
  failed: number;
  results: Array<{ filePath: string; success: boolean; error?: string }>;
}> {
  const results = [];
  let successful = 0;
  let failed = 0;

  for (const request of fileIntegrations) {
    let result: { success: boolean; updatedContent?: string; error?: string };

    // For new files with no existing content, use pure deterministic generation
    if (
      !request.existingContent &&
      request.componentsToAdd.length > 0 &&
      request.componentsToModify.length === 0
    ) {
      try {
        // Collect all placeholder replacements from components
        const allReplacements: Record<string, string> = {};
        request.componentsToAdd.forEach((comp) => {
          if (comp.placeholderReplacements) {
            Object.assign(allReplacements, comp.placeholderReplacements);
          }
        });

        // Generate file content deterministically (with placeholders)
        const imports = Array.from(new Set(request.componentsToAdd.flatMap((c) => c.imports)));
        const exports = request.componentsToAdd.map((c) => c.exportDefinition);
        const fileContentWithPlaceholders = [...imports, '', ...exports].join('\n') + '\n';

        // Restore placeholders to get the final content
        const finalContent =
          Object.keys(allReplacements).length > 0
            ? restorePlaceholders(fileContentWithPlaceholders, allReplacements)
            : fileContentWithPlaceholders;

        // Don't write to file - let temp validation system handle file writing
        // This prevents overwriting real files before validation

        result = { success: true, updatedContent: finalContent };
      } catch (error: any) {
        result = { success: false, error: error.message };
      }
    } else {
      // For existing files or complex cases, use LLM integration
      result = await integrateComponentsIntoFile({ ...request, debug });
    }

    results.push({
      filePath: request.filePath,
      success: result.success,
      error: result.error,
    });

    if (result.success) {
      successful++;
    } else {
      failed++;
      console.error(chalk.red(`Failed to process ${request.filePath}: ${result.error}`));
    }
  }

  return { successful, failed, results };
}
