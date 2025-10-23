/**
 * Hybrid generator - combines deterministic generation with LLM integration
 * 
 * This approach generates components deterministically (fast, reliable) and then
 * uses LLM to intelligently integrate them into existing files with proper formatting.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { generateText } from 'ai';
import { createModel } from '../pull.llm-generate';
import { createPlaceholders, restorePlaceholders, calculateTokenSavings } from '../pull.placeholder-system';
import chalk from 'chalk';

// Import deterministic generators
import { generateToolImports, generateToolExport } from './tool-generator';
import { generateAgentImports, generateAgentExport, generateAgentFile } from './agent-generator';
import { generateDataComponentImports, generateDataComponentExport, generateDataComponentFile } from './data-component-generator';
import { generateArtifactComponentImports, generateArtifactComponentExport, generateArtifactComponentFile } from './artifact-component-generator';
import { generateStatusComponentImports, generateStatusComponentExport, generateStatusComponentFile } from './status-component-generator';
import { DEFAULT_CODE_STYLE, type CodeStyle } from './generator-utils';

interface ComponentParts {
  imports: string[];
  exportDefinition: string;
  componentType: 'tool' | 'dataComponent' | 'artifactComponent' | 'statusComponent' | 'agent' | 'environment';
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
  usePlaceholders: boolean = true
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
    
    if (Object.keys(replacements).length > 0) {
      console.log(`    📦 Created ${Object.keys(replacements).length} placeholders for ${componentType} ${componentId}`);
    }
  } else {
    // Use original data directly for deterministic generation
    processedComponentData = componentData;
  }

  let imports: string[] = [];
  let exportDefinition: string = '';

  switch (componentType) {
    case 'tool':
      imports = generateToolImports(componentId, processedComponentData, style);
      exportDefinition = generateToolExport(componentId, processedComponentData, style, componentNameMap);
      break;
      
    case 'dataComponent':
      imports = generateDataComponentImports(componentId, processedComponentData, style);
      exportDefinition = generateDataComponentExport(componentId, processedComponentData, style, componentNameMap);
      break;
      
    case 'artifactComponent':
      imports = generateArtifactComponentImports(componentId, processedComponentData, style);
      exportDefinition = generateArtifactComponentExport(componentId, processedComponentData, style, componentNameMap);
      break;
      
    case 'statusComponent':
      imports = generateStatusComponentImports(componentId, processedComponentData, style);
      exportDefinition = generateStatusComponentExport(componentId, processedComponentData, style, componentNameMap);
      break;
      
    case 'agent':
      if (project && componentNameMap) {
        imports = generateAgentImports(componentId, processedComponentData, project, style, componentNameMap);
        exportDefinition = generateAgentExport(componentId, processedComponentData, project, style, componentNameMap);
      } else {
        // Fallback to full file generation and extraction
        const agentFile = generateAgentFile(componentId, processedComponentData, project || {}, style, componentNameMap || new Map());
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
    placeholderReplacements: replacements // Store replacements so we can restore them later
  };
}

/**
 * Extract imports and export from a generated file (temporary helper)
 */
function extractImportsAndExport(fileContent: string): { imports: string[]; exportDefinition: string } {
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
    exportDefinition: exportLines.join('\n')
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
    // ALWAYS show what's being sent to LLM for debugging
    console.log(chalk.cyan(`\n🤖 LLM INTEGRATION DEBUG for ${filePath}:`));
    console.log(chalk.gray(`📡 Model: ${process.env.INKEEP_LLM_MODEL || 'default'}`));
    console.log(chalk.cyan(`📝 Components to ADD: ${componentsToAdd.map(c => `${c.componentId} (${c.componentType})`).join(', ') || 'none'}`));
    console.log(chalk.yellow(`🔄 Components to MODIFY: ${componentsToModify.map(c => `${c.componentId} (${c.componentType})`).join(', ') || 'none'}`));

    // Collect all placeholder replacements from components BEFORE creating integration data
    const allReplacements: Record<string, string> = {};
    [...componentsToAdd, ...componentsToModify].forEach(comp => {
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
      apiKey: process.env.INKEEP_LLM_API_KEY,
    });

    const { generateText } = await import('ai');
    
    // Build prompt with concrete code instructions instead of JSON
    const prompt = promptTemplate
      .replace('{{EXISTING_CONTENT}}', existingContent)
      .replace('{{ADD_INSTRUCTIONS}}', addInstructions)
      .replace('{{MODIFY_INSTRUCTIONS}}', modifyInstructions);
    
    console.log(chalk.magenta(`\n📋 CUSTOM PLACEHOLDER PROMPT (clean TypeScript structure):`));
    console.log(chalk.gray('=' + '='.repeat(120)));
    console.log(prompt);
    console.log(chalk.gray('=' + '='.repeat(120)));
    console.log(chalk.magenta(`📏 Prompt length: ${prompt.length} characters`));
    console.log(chalk.magenta(`🔗 Placeholders to restore: ${Object.keys(allReplacements).length}`));
    
    const { text: generatedContent } = await generateText({
      model,
      prompt,
      temperature: 0.1, // Low temperature for consistent code
      maxOutputTokens: 16000, // Large enough for complex files
      abortSignal: AbortSignal.timeout(60000), // 60 second timeout
    });
    
    const duration = Date.now() - startTime;
    if (debug) {
      console.log(chalk.gray(`    ⚡ LLM integration completed in ${duration}ms`));
    }

    // Restore placeholders using our custom system
    const restoredContent = Object.keys(allReplacements).length > 0 
      ? restorePlaceholders(generatedContent, allReplacements)
      : generatedContent;
    
    console.log(chalk.gray(`    🔄 Restored ${Object.keys(allReplacements).length} placeholders in generated content`));

    // Clean the generated content
    const cleanedContent = cleanGeneratedCode(restoredContent);
    
    // Write back to file
    writeFileSync(filePath, cleanedContent, 'utf-8');

    return {
      success: true,
      updatedContent: cleanedContent
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message
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
1. **Follow the specific instructions above**: Add new components where specified, replace existing components where specified
2. **Use the provided code exactly**: The component definitions were generated deterministically - use them EXACTLY as provided (do not modify the code)
3. **Match existing file style**: Format the integrated code to match the existing file's coding style (spacing, indentation, organization)
4. **Smart import management**: Merge import statements intelligently (no duplicates, maintain organization)
5. **Preserve everything else**: Keep all existing components that aren't being replaced, preserve comments and formatting

CRITICAL RULES:
- DO NOT modify any existing components unless specifically instructed to replace them
- DO NOT rewrite or improve the provided component code
- DO NOT change variable names, logic, or structure of the provided components
- Only add or replace components as specifically instructed

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
    if (!request.existingContent && request.componentsToAdd.length > 0 && request.componentsToModify.length === 0) {
      try {
        // Collect all placeholder replacements from components
        const allReplacements: Record<string, string> = {};
        request.componentsToAdd.forEach(comp => {
          if (comp.placeholderReplacements) {
            Object.assign(allReplacements, comp.placeholderReplacements);
          }
        });

        // Generate file content deterministically (with placeholders)
        const imports = Array.from(new Set(request.componentsToAdd.flatMap(c => c.imports)));
        const exports = request.componentsToAdd.map(c => c.exportDefinition);
        const fileContentWithPlaceholders = [...imports, '', ...exports].join('\n') + '\n';
        
        // Restore placeholders to get the final content (don't escape for template literals)
        const finalContent = Object.keys(allReplacements).length > 0 
          ? restorePlaceholders(fileContentWithPlaceholders, allReplacements, false)
          : fileContentWithPlaceholders;
        
        if (debug && Object.keys(allReplacements).length > 0) {
          console.log(chalk.gray(`    🔄 Restored ${Object.keys(allReplacements).length} placeholders in deterministic content`));
        }
        
        // Write the restored content to file
        writeFileSync(request.filePath, finalContent, 'utf-8');
        
        result = { success: true, updatedContent: finalContent };
        
        if (debug) {
          console.log(chalk.green(`    ✓ Generated new file deterministically: ${request.filePath}`));
        }
      } catch (error: any) {
        result = { success: false, error: error.message };
      }
    } else {
      // For existing files or complex cases, use LLM integration
      result = await integrateComponentsIntoFile({ ...request, debug });
      
      if (debug && result.success) {
        console.log(chalk.green(`    ✓ Integrated components into ${request.filePath}`));
      }
    }
    
    results.push({
      filePath: request.filePath,
      success: result.success,
      error: result.error
    });

    if (result.success) {
      successful++;
    } else {
      failed++;
      console.log(chalk.red(`    ✗ Failed to process ${request.filePath}: ${result.error}`));
    }
  }

  return { successful, failed, results };
}