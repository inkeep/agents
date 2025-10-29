/**
 * LLM Content Merger - Intelligently merge old and new component content
 * 
 * Uses an LLM to selectively update modified components while preserving:
 * - Original file structure and formatting
 * - Code style consistency
 * - Better zod schemas
 * - Imports and other non-component code
 */

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import chalk from 'chalk';
import { createTargetedTypeScriptPlaceholders, restoreTargetedTypeScriptPlaceholders } from './targeted-typescript-placeholders';

/**
 * Strip code fences from LLM response if present
 */
function stripCodeFences(content: string): string {
  // Remove opening code fence with optional language specifier
  content = content.replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/i, '');
  
  // Remove closing code fence
  content = content.replace(/\n?```\s*$/i, '');
  
  return content;
}

/**
 * Estimate tokens in text (rough approximation: 1 token ≈ 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function calculateCostEstimate(promptTokens: number, completionTokens: number): number {
  const promptCost = (promptTokens / 1000000) * 3.0;
  const completionCost = (completionTokens / 1000000) * 15.0;
  return promptCost + completionCost;
}

interface ComponentMergeRequest {
  oldContent: string;
  newContent: string;
  modifiedComponents: Array<{
    componentId: string;
    componentType: string;
  }>;
  filePath: string;
}

interface ComponentMergeResult {
  mergedContent: string;
  changes: string[];
  success: boolean;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

/**
 * Use LLM to intelligently merge old content with new component definitions
 */
export async function mergeComponentsWithLLM(
  request: ComponentMergeRequest,
): Promise<ComponentMergeResult> {
  const { oldContent, newContent, modifiedComponents, filePath } = request;
  

  const componentList = modifiedComponents.map(c => `- ${c.componentType}:${c.componentId}`).join('\n');

  const prompt = `You are a TypeScript code expert tasked with intelligently merging component updates.

## Task
Merge the OLD file content with NEW component definitions, preserving the original file structure while updating only the modified components.

## Modified Components to Update
${componentList}

## Instructions
0. **Please ensure you focus changes to minimize git diff size.** We want a clean git history.
1. **Preserve original structure**: Keep imports, exports, comments, and overall file organization
2. **Update only modified components**: Replace the specified components with their new versions
3. **Maintain code style**: Match the original formatting, indentation, and style
4. **Improve schemas**: Use better zod schemas from the new content where applicable. E.g. if the new content uses something like z.union([z.null(), z.string()]), use z.string().nullable() instead. 
5. **Keep variable names**: Preserve original variable names and declarations
6. **Preserve non-component code**: Keep any non-component logic, comments, or utilities
7. **Please leave all imports at the top of the file.** Don't use .js imports, use .ts imports instead. (import example from './example')

## OLD Content:
\`\`\`typescript
${oldContent}
\`\`\`

## NEW Component Definitions:
\`\`\`typescript
${newContent}
\`\`\`

## Output
Provide the merged TypeScript file that:
- Keeps the original file structure
- Updates ONLY the modified components listed above
- Maintains consistent code style
- Uses improved schemas where beneficial
- Preserves all imports, exports, and other code
- Start the code immidiately with the first line of the file, skip any backticks or other formatting announcing that it is a code block or typescript file.
- Please follow biomes.dev code style.

Return only the merged TypeScript code without any explanation or markdown formatting.`;

  try {
    // Apply targeted placeholders to reduce prompt size and preserve large content
    const oldPlaceholders = createTargetedTypeScriptPlaceholders(oldContent);
    const newPlaceholders = createTargetedTypeScriptPlaceholders(newContent);
        
    // Use placeholder-processed content in the prompt
    const processedPrompt = prompt
      .replace(oldContent, oldPlaceholders.processedContent)
      .replace(newContent, newPlaceholders.processedContent);    

    // Estimate prompt tokens before sending
    const estimatedPromptTokens = estimateTokens(processedPrompt);
    
    const result = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      prompt: processedPrompt,
    });

    let mergedContent = result.text.trim();
    
    // Strip code fences if the LLM wrapped the response in code blocks
    mergedContent = stripCodeFences(mergedContent);
    
    // Estimate completion tokens and calculate costs
    const estimatedCompletionTokens = estimateTokens(mergedContent);
    const totalTokens = estimatedPromptTokens + estimatedCompletionTokens;
    const estimatedCost = calculateCostEstimate(estimatedPromptTokens, estimatedCompletionTokens);
    
    // Log token usage and cost
    console.log(chalk.cyan(`   📊 Token Usage & Cost Estimate:`));
    console.log(chalk.gray(`      Prompt tokens: ~${estimatedPromptTokens.toLocaleString()}`));
    console.log(chalk.gray(`      Completion tokens: ~${estimatedCompletionTokens.toLocaleString()}`));
    console.log(chalk.gray(`      Total tokens: ~${totalTokens.toLocaleString()}`));
    console.log(chalk.green(`      Estimated cost: $${estimatedCost.toFixed(4)}`));
    
    // Restore placeholders in the generated content
    
    // Merge both placeholder maps for restoration
    const allReplacements = {
      ...oldPlaceholders.replacements,
      ...newPlaceholders.replacements
    };
    
    if (Object.keys(allReplacements).length > 0) {
      mergedContent = restoreTargetedTypeScriptPlaceholders(mergedContent, allReplacements);
      
    }
    
    // Extract what changed (simple heuristic)
    const changes = modifiedComponents.map(c => 
      `Updated ${c.componentType}:${c.componentId}`
    );


    return {
      mergedContent,
      changes,
      success: true,
      usage: {
        promptTokens: estimatedPromptTokens,
        completionTokens: estimatedCompletionTokens,
        totalTokens: totalTokens,
        estimatedCost: estimatedCost,
      },
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    

    return {
      mergedContent: oldContent, // Fallback to original
      changes: [],
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Preview the merge result by showing a diff-like summary
 */
export function previewMergeResult(
  oldContent: string, 
  mergedContent: string,
  changes: string[]
): void {
  console.log(chalk.cyan('\n🔍 Merge Preview:'));
  console.log(chalk.gray(`   Old content: ${oldContent.length} characters`));
  console.log(chalk.gray(`   New content: ${mergedContent.length} characters`));
  console.log(chalk.yellow(`   Changes applied:`));
  
  changes.forEach(change => {
    console.log(chalk.gray(`     • ${change}`));
  });

  // Show first few lines of merged content
  const lines = mergedContent.split('\n');
  const preview = lines.slice(0, 10).join('\n');
  
  console.log(chalk.cyan('\n📄 Merged content preview (first 10 lines):'));
  console.log(chalk.gray('   ┌─────'));
  preview.split('\n').forEach((line, i) => {
    console.log(chalk.gray(`   │ ${String(i + 1).padStart(2, ' ')}: ${line}`));
  });
  if (lines.length > 10) {
    console.log(chalk.gray(`   │ ... (${lines.length - 10} more lines)`));
  }
  console.log(chalk.gray('   └─────'));
}