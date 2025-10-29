/**
 * LLM-assisted code updates for pull-v2
 *
 * Uses proven LLM instruction patterns from existing pull command for intelligent
 * integration of remote changes into existing local code while preserving formatting,
 * comments, and local customizations.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateText } from 'ai';
import chalk from 'chalk';
import { createModel } from '../pull.llm-generate';
import {
  calculateTokenSavings,
  createPlaceholders,
  restorePlaceholders,
} from '../pull.placeholder-system';
import { extractTokenUsage, tokenTracker } from './token-tracker';

interface UpdateContext {
  componentType:
    | 'agent'
    | 'tool'
    | 'dataComponent'
    | 'artifactComponent'
    | 'statusComponent'
    | 'project'
    | 'environment';
  componentId: string;
  filePath: string;
  currentContent: string;
  remoteData: any;
  localData?: any;
  changes: string[]; // Specific changes detected from comparison
}

interface LLMUpdateResult {
  success: boolean;
  updatedContent?: string;
  error?: string;
  preservedElements: string[]; // What was preserved (comments, formatting, etc.)
  appliedChanges: string[]; // What changes were applied
}

// Constants from existing pull command
const NAMING_CONVENTION_RULES = `
CRITICAL NAMING CONVENTION RULES (Apply to ALL imports/exports):
- File paths use kebab-case naming (e.g., '../tools/tool-name', '../data-components/component-name')
- Variable names MUST be camelCase versions of the entity ID
- Conversion rules for variable names:
  - IDs with underscores: 'inkeep_facts' → inkeepFacts
  - IDs with hyphens: 'weather-api' → weatherApi
  - IDs with both: 'my_weather-api' → myWeatherApi
  - Random/UUID IDs: Keep as-is (e.g., 'fUI2riwrBVJ6MepT8rjx0' → fUI2riwrBVJ6MepT8rjx0)
- The ID field in the exported object keeps the original format
- IMPORTANT: Import paths use kebab-case file names, NOT entity IDs
`;

const IMPORT_INSTRUCTIONS = `
CRITICAL: All imports MUST be alphabetically sorted (both named imports and path names)
CRITICAL IMPORT PATTERNS:
- Tools: Import from '../tools/{file-name}' (use kebab-case file names)
- Data components: Import from '../data-components/{file-name}' (use kebab-case file names)
- Artifact components: Import from '../artifact-components/{file-name}' (use kebab-case file names)
- Agent: Import from './agents/{file-name}' (use kebab-case file names)
NEVER use barrel imports from directories:
❌ WRONG: import { ordersList, refundApproval } from '../data-components';
✅ CORRECT:
   import { ordersList } from '../data-components/orders-list';
   import { refundApproval } from '../data-components/refund-approval';
`;

/**
 * Update modified components using LLM assistance with proven instruction patterns
 */
export async function updateModifiedComponentWithLLM(
  componentType: UpdateContext['componentType'],
  componentId: string,
  remoteData: any,
  localData: any,
  projectDir: string,
  changes: string[],
  debug: boolean = false
): Promise<LLMUpdateResult> {
  const filePath = getComponentFilePath(componentType, componentId, projectDir);

  if (debug) {
    console.log(chalk.blue(`\n🤖 LLM Update - ${componentType}:${componentId}`));
    console.log(chalk.gray(`   File: ${filePath}`));
    console.log(chalk.gray(`   Changes: ${changes.length} detected`));
    if (changes.length > 0) {
      for (const change of changes.slice(0, 5)) {
        console.log(chalk.gray(`     • ${change}`));
      }
      if (changes.length > 5) {
        console.log(chalk.gray(`     ... and ${changes.length - 5} more`));
      }
    }
  }

  try {
    const currentContent = readFileSync(filePath, 'utf-8');

    if (debug) {
      console.log(chalk.gray(`   Current file size: ${currentContent.length} characters`));
    }

    const context: UpdateContext = {
      componentType,
      componentId,
      filePath,
      currentContent,
      remoteData,
      localData,
      changes,
    };

    // Generate component-specific prompt using existing proven patterns
    if (debug) {
      console.log(chalk.gray('   Generating LLM prompt...'));
    }
    const prompt = generateUpdatePrompt(context, debug);

    if (debug) {
      console.log(chalk.gray(`   Prompt size: ${prompt.length} characters`));
    }

    // Call LLM with same settings as existing pull command
    if (debug) {
      console.log(chalk.gray('   Calling LLM for code update...'));
    }

    const model = createModel({
      model: process.env.INKEEP_LLM_MODEL,
    });

    const startTime = Date.now();
    const response = await generateText({
      model,
      prompt,
      temperature: 0.1, // Low temperature for consistent code generation
      maxOutputTokens: getMaxTokensForComponent(componentType),
      abortSignal: AbortSignal.timeout(60000), // 60 second timeout
    });
    const duration = Date.now() - startTime;

    if (debug) {
      console.log(chalk.gray(`   LLM response received in ${duration}ms`));
    }

    // Track token usage
    const usage = extractTokenUsage(response);
    if (usage) {
      tokenTracker.recordCall(`update-${componentType}`, usage, duration);
      if (debug) {
        console.log(
          chalk.gray(`   Tokens: ${usage.inputTokens} input, ${usage.outputTokens} output`)
        );
      }
    }

    const generatedContent = response.text;

    if (debug) {
      console.log(chalk.gray(`   Generated content size: ${generatedContent.length} characters`));
    }

    // Restore placeholders in generated content
    const placeholderReplacements = (context as any).placeholderReplacements || {};
    const restoredContent =
      Object.keys(placeholderReplacements).length > 0
        ? restorePlaceholders(generatedContent, placeholderReplacements)
        : generatedContent;

    if (debug && Object.keys(placeholderReplacements).length > 0) {
      console.log(
        chalk.gray(`   Restored ${Object.keys(placeholderReplacements).length} placeholders`)
      );
    }

    // Clean and validate the generated content
    if (debug) {
      console.log(chalk.gray('   Validating generated content...'));
    }

    const cleanedContent = cleanGeneratedCode(restoredContent);
    const validation = validateUpdatedContent(cleanedContent, context);

    if (!validation.isValid) {
      if (debug) {
        console.log(chalk.red('   ✗ Validation failed:'));
        for (const error of validation.errors) {
          console.log(chalk.red(`     - ${error}`));
        }
      }
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        preservedElements: [],
        appliedChanges: [],
      };
    }

    if (debug) {
      console.log(chalk.gray('   ✓ Validation passed'));
      if (validation.preserved.length > 0) {
        console.log(chalk.gray(`   Preserved: ${validation.preserved.join(', ')}`));
      }
    }

    // Write updated content back to file
    writeFileSync(filePath, cleanedContent, 'utf-8');

    if (debug) {
      console.log(chalk.green(`   ✓ File updated successfully`));
    }

    return {
      success: true,
      updatedContent: cleanedContent,
      preservedElements: validation.preserved,
      appliedChanges: extractAppliedChanges(currentContent, cleanedContent, changes),
    };
  } catch (error: any) {
    console.log(chalk.red(`   ✗ Error updating ${componentType}:${componentId}: ${error.message}`));
    if (debug && error.stack) {
      console.log(chalk.red(`   Stack trace: ${error.stack}`));
    }
    return {
      success: false,
      error: error.message,
      preservedElements: [],
      appliedChanges: [],
    };
  }
}

/**
 * Generate component-specific LLM prompt using existing proven patterns
 * Integrates placeholder system to reduce prompt size and avoid reproducing long content
 */
function generateUpdatePrompt(context: UpdateContext, debug: boolean = false): string {
  const { componentType, currentContent, remoteData, changes } = context;

  // Create placeholders for long strings in remote data to reduce prompt size
  const placeholderResult = createPlaceholders(remoteData, { fileType: componentType });
  const processedRemoteData = placeholderResult.processedData;
  const replacements = placeholderResult.replacements;

  const savingsResult = calculateTokenSavings(remoteData, processedRemoteData);

  if (debug && savingsResult.savings > 0) {
    console.log(chalk.gray(`   Placeholder savings: ~${savingsResult.savings} tokens`));
  }

  const componentSpecificInstructions = getComponentSpecificInstructions(componentType);

  const prompt = `You are an expert TypeScript developer. You must make MINIMAL changes to an existing TypeScript file. Your job is to update ONLY the specific values that have changed, while preserving EVERYTHING else exactly as it is.

EXISTING FILE CONTENT:
\`\`\`typescript
${currentContent}
\`\`\`

NEW/UPDATED DATA FOR ${componentType.toUpperCase()}:
\`\`\`json
${JSON.stringify(processedRemoteData, null, 2)}
\`\`\`

DETECTED CHANGES:
${changes.map((change) => `- ${change}`).join('\n')}

${NAMING_CONVENTION_RULES}

${IMPORT_INSTRUCTIONS}

${componentSpecificInstructions}

WHAT TO CHANGE:
- Only update property values (like id, name, description, prompt, etc.) that are different according to the detected changes
- If a property value is the same, leave it exactly as it is
- If a new component/property is added in the remote data, add it following the existing patterns
- If a component/property is removed from the remote data, remove it from the file

WHAT NOT TO CHANGE:
- Do not rewrite entire functions or objects unless absolutely necessary
- Do not change the structure or organization  
- Do not remove or modify existing comments
- Do not change formatting or style beyond what's needed for the updates
- Do not reorganize code blocks
- Do not change import statements unless absolutely necessary
- Do not change variable names or export names

CRITICAL: Generate ONLY the raw TypeScript code. Do NOT wrap it in markdown code blocks (no triple backticks with typescript). Do NOT include any explanations, comments, or markdown formatting. Return only the pure TypeScript code that can be written directly to a .ts file.`;

  // Store replacements in context for restoration later
  (context as any).placeholderReplacements = replacements;

  return prompt;
}

/**
 * Get component-specific instructions based on existing pull patterns
 */
function getComponentSpecificInstructions(componentType: UpdateContext['componentType']): string {
  switch (componentType) {
    case 'agent':
      return `AGENT-SPECIFIC INSTRUCTIONS:
1. Import paths are based on actual file names, not entity IDs
   - Always use kebab-case file paths (../tools/tool-name, not ../tools/tool_name)
   - ALWAYS import { agent, subAgent } from '@inkeep/agents-sdk'
   - ALWAYS import { z } from 'zod' when using ANY Zod schemas (responseSchema, headersSchema, etc.)
   - ALWAYS import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core' when agent has contextConfig
   - Import status components from '../status-components/' when needed

2. CRITICAL: Template Literals vs Raw Code:
   - For STRING VALUES: ALWAYS use template literals with backticks: \`string content\`
   - This includes: prompt, description, query, url, method, body, defaultValue, etc.
   - This prevents TypeScript syntax errors with apostrophes (user's, don't, etc.)
   - IMPORTANT: ANY placeholder that starts with < and ends with > MUST be wrapped in template literals (backticks)
   - For object keys: use quotes only for keys with hyphens ('Content-Type'), omit for simple identifiers (Authorization)
   
   EXCEPTION - Schema Fields (NO template literals):
   - headersSchema: z.object({ ... }) (raw Zod code, NOT a string)
   - responseSchema: z.object({ ... }) (raw Zod code, NOT a string)
   - These are TypeScript expressions, not string values

3. Template variable conversion:
   - Convert {{headers.variable}} to headers.toTemplate('variable')
   - Convert {{contextVariable.field}} to contextVariable.toTemplate('field')

4. For contextConfig (CRITICAL):
   - NEVER use plain objects for contextConfig
   - ALWAYS use helper functions: headers(), fetchDefinition(), contextConfig()
   - Create separate const variables for each helper before the agent definition
   - Pattern: const myHeaders = headers({ schema: z.object({ api_key: z.string() }) });
   - Pattern: const myFetch = fetchDefinition({ id: '...', fetchConfig: {...}, responseSchema: z.object({...}) });
   - Pattern: const myContext = contextConfig({ headers: myHeaders, contextVariables: { data: myFetch } });
   - Then use: export const myAgent = agent({ contextConfig: myContext });
   - Use myHeaders.toTemplate('key_name') for header interpolation in fetch configs
   - Use myContext.toTemplate('variable.field') for context variable interpolation

5. Preserve function references:
   - canUse: () => [tool1, tool2] (function that returns array)
   - canTransferTo: () => [agent1] (function that returns array)
   - canDelegateTo: () => [externalAgent] (function that returns array)

6. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()

7. If description is null, undefined, or empty string, omit the description field entirely`;

    case 'tool':
      return `TOOL-SPECIFIC INSTRUCTIONS:
1. For MCP tools: Preserve serverUrl, transport, imageUrl properties
2. For function tools: Preserve execute functions and dependencies  
3. Use template literals for string values like name, description
4. Preserve exact import statements for tool dependencies
5. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()`;

    case 'dataComponent':
      return `DATA COMPONENT-SPECIFIC INSTRUCTIONS:
1. Import dataComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' for schema definitions
3. Include all properties from the component data INCLUDING the 'id' property
4. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
5. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()
6. Use template literals for description strings
7. Maintain .describe() chains for schema documentation`;

    case 'artifactComponent':
      return `ARTIFACT COMPONENT-SPECIFIC INSTRUCTIONS:
1. Import artifactComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' and preview from '@inkeep/agents-core' for schema definitions
3. Use preview() helper for fields that should be shown in previews
4. Export following naming convention rules (camelCase version of ID)
5. Include the 'id' property to preserve the original component ID
6. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
7. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()
8. Preserve preview() wrapper usage for inPreview fields
9. Maintain Zod schema structure with proper z.object() syntax`;

    case 'statusComponent':
      return `STATUS COMPONENT-SPECIFIC INSTRUCTIONS:
1. Import statusComponent from '@inkeep/agents-sdk'
2. Import z from 'zod' for schema definitions
3. Export following naming convention rules (camelCase version of ID)
4. Use 'type' field as the identifier (like 'tool_summary')
5. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
6. If you are writing zod schemas make them clean. For example if you see z.union([z.string(), z.null()]) write it as z.string().nullable()
7. The statusComponent() function handles conversion to .config automatically
8. Preserve detailsSchema Zod structure`;

    case 'project':
      return `PROJECT-SPECIFIC INSTRUCTIONS:
1. Import project function from '@inkeep/agents-sdk'
2. The project object should include all required properties and any optional properties that are present in the project data
3. Preserve agents: () => [...] function structure  
4. Maintain project-level models and stopWhen configuration
5. Keep exact import statements and variable references
6. Use template literals for project name and description
7. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting
8. For contextConfig: Use contextConfig(), headers(), fetchDefinition() functions from @inkeep/agents-core
9. Preserve template variable conversions using .toTemplate() methods`;

    case 'environment':
      return `ENVIRONMENT-SPECIFIC INSTRUCTIONS:
1. Import registerEnvironmentSettings and credential from '@inkeep/agents-sdk'
2. Use credential() function for each credential configuration
3. Preserve existing credential structure and naming
4. Maintain credentialStoreId and retrievalParams structure
5. Use template literals for credential IDs and keys
6. CRITICAL: All imports must be alphabetically sorted to comply with Biome linting`;

    default:
      return '';
  }
}

/**
 * Get appropriate max tokens based on component type (same as existing pull)
 */
function getMaxTokensForComponent(componentType: UpdateContext['componentType']): number {
  switch (componentType) {
    case 'agent':
      return 16000; // Agents can be complex with multiple subAgents
    case 'project':
      return 4000; // Index files with imports
    case 'tool':
    case 'dataComponent':
    case 'artifactComponent':
    case 'statusComponent':
      return 4000; // Individual components
    default:
      return 4000;
  }
}

/**
 * Clean generated code by removing markdown formatting (same as existing pull)
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
 * Get file path for a component
 */
function getComponentFilePath(
  componentType: UpdateContext['componentType'],
  componentId: string,
  projectDir: string
): string {
  const fileName = componentId
    .replace(/[^a-zA-Z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  switch (componentType) {
    case 'agent':
      return join(projectDir, 'agents', `${fileName}.ts`);
    case 'tool':
      return join(projectDir, 'tools', `${fileName}.ts`);
    case 'dataComponent':
      return join(projectDir, 'data-components', `${fileName}.ts`);
    case 'artifactComponent':
      return join(projectDir, 'artifact-components', `${fileName}.ts`);
    case 'statusComponent':
      return join(projectDir, 'status-components', `${fileName}.ts`);
    case 'environment':
      return join(projectDir, 'environments', `${fileName}.env.ts`);
    case 'project':
      return join(projectDir, 'index.ts');
    default:
      throw new Error(`Unknown component type: ${componentType}`);
  }
}

/**
 * Validate updated content to ensure it's valid TypeScript and preserves key elements
 */
function validateUpdatedContent(
  updatedContent: string,
  context: UpdateContext
): { isValid: boolean; errors: string[]; preserved: string[] } {
  const errors: string[] = [];
  const preserved: string[] = [];

  // Basic syntax validation
  if (!updatedContent.trim()) {
    errors.push('Updated content is empty');
    return { isValid: false, errors, preserved };
  }

  // Check for TypeScript syntax basics
  if (!updatedContent.includes('export ')) {
    errors.push('Missing export statement');
  }

  // Check that imports are preserved/improved
  const originalImports = extractImports(context.currentContent);
  const updatedImports = extractImports(updatedContent);

  if (originalImports.length > 0 && updatedImports.length >= originalImports.length) {
    preserved.push('import statements');
  } else if (updatedImports.length < originalImports.length) {
    errors.push('Some import statements were removed');
  }

  // Check that comments are mostly preserved
  const originalComments = extractComments(context.currentContent);
  const updatedComments = extractComments(updatedContent);

  if (
    originalComments.length > 0 &&
    updatedComments.length >= Math.floor(originalComments.length * 0.7)
  ) {
    preserved.push('comments and documentation');
  }

  // Check for basic TypeScript validity
  const hasBasicTSStructure = updatedContent.includes('{') && updatedContent.includes('}');
  if (!hasBasicTSStructure) {
    errors.push('Updated content lacks basic TypeScript structure');
  }

  // Check for alphabetically sorted imports (Biome compliance)
  if (areImportsSorted(updatedImports)) {
    preserved.push('alphabetically sorted imports (Biome compliance)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    preserved,
  };
}

/**
 * Check if imports are alphabetically sorted
 */
function areImportsSorted(imports: string[]): boolean {
  if (imports.length <= 1) return true;

  const sorted = [...imports].sort();
  return JSON.stringify(imports) === JSON.stringify(sorted);
}

/**
 * Extract applied changes by comparing old vs new content
 */
function extractAppliedChanges(
  originalContent: string,
  updatedContent: string,
  detectedChanges: string[]
): string[] {
  const applied: string[] = [];

  if (originalContent !== updatedContent) {
    applied.push(`File updated with ${detectedChanges.length} detected changes`);

    // Simple analysis of what changed
    const originalLines = originalContent.split('\n');
    const updatedLines = updatedContent.split('\n');

    let linesChanged = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (let i = 0; i < Math.max(originalLines.length, updatedLines.length); i++) {
      if (i >= originalLines.length) {
        linesAdded++;
      } else if (i >= updatedLines.length) {
        linesRemoved++;
      } else if (originalLines[i] !== updatedLines[i]) {
        linesChanged++;
      }
    }

    if (linesChanged > 0) applied.push(`${linesChanged} lines modified`);
    if (linesAdded > 0) applied.push(`${linesAdded} lines added`);
    if (linesRemoved > 0) applied.push(`${linesRemoved} lines removed`);
  }

  return applied;
}

/**
 * Extract import statements from TypeScript content
 */
function extractImports(content: string): string[] {
  const importRegex = /^import\s+.*?from\s+['"][^'"]*['"];?\s*$/gm;
  return content.match(importRegex) || [];
}

/**
 * Extract comments from TypeScript content
 */
function extractComments(content: string): string[] {
  const comments: string[] = [];

  // Single line comments
  const singleLineComments = content.match(/\/\/.*$/gm) || [];
  comments.push(...singleLineComments);

  // Multi-line comments
  const multiLineComments = content.match(/\/\*[\s\S]*?\*\//g) || [];
  comments.push(...multiLineComments);

  return comments;
}

/**
 * Batch update multiple modified components
 */
export async function batchUpdateModifiedComponents(
  modifications: Array<{
    componentType:
      | 'agent'
      | 'tool'
      | 'dataComponent'
      | 'artifactComponent'
      | 'statusComponent'
      | 'project'
      | 'environment';
    componentId: string;
    remoteData: any;
    localData: any;
    changes: string[];
  }>,
  projectDir: string,
  debug: boolean = false
): Promise<{
  successful: number;
  failed: number;
  results: LLMUpdateResult[];
}> {
  const results: LLMUpdateResult[] = [];
  let successful = 0;
  let failed = 0;

  if (debug) {
    console.log(chalk.blue(`\n📦 Batch Update - Processing ${modifications.length} components`));
  }

  for (let i = 0; i < modifications.length; i++) {
    const mod = modifications[i];

    if (debug) {
      console.log(
        chalk.gray(
          `\n[${i + 1}/${modifications.length}] Processing ${mod.componentType}:${mod.componentId}...`
        )
      );
    }

    const result = await updateModifiedComponentWithLLM(
      mod.componentType,
      mod.componentId,
      mod.remoteData,
      mod.localData,
      projectDir,
      mod.changes,
      debug
    );

    results.push(result);

    if (result.success) {
      successful++;
      if (!debug) {
        console.log(chalk.green(`    ✓ ${mod.componentType}:${mod.componentId} updated`));
      }
    } else {
      failed++;
      console.log(
        chalk.red(`    ✗ ${mod.componentType}:${mod.componentId} failed: ${result.error}`)
      );
    }
  }

  if (debug) {
    console.log(chalk.blue(`\n📊 Batch Update Complete`));
    console.log(chalk.gray(`   Successful: ${successful}`));
    console.log(chalk.gray(`   Failed: ${failed}`));
  }

  return { successful, failed, results };
}
