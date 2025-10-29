/**
 * Targeted TypeScript Placeholder System
 * 
 * Only replaces specific, safe fields that tend to be large:
 * - prompt: (template literals or strings)
 * - description: (string literals)  
 * - inputSchema: (object literals)
 * - detailsSchema: (object literals)
 * - props: (object literals in artifact/data components)
 */

import { randomBytes } from 'node:crypto';

interface TargetedPlaceholderResult {
  processedContent: string;
  replacements: Record<string, string>;
  stats: {
    originalSize: number;
    processedSize: number;
    savings: number;
    savingsPercentage: number;
    replacedFields: number;
  };
}

/**
 * Generate a unique placeholder ID
 */
function generatePlaceholderId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Minimum length threshold for replacement (only replace if longer than this)
 */
const MIN_REPLACEMENT_LENGTH = 10; // Lowered from 80 to catch more fields

/**
 * Create targeted placeholders for specific TypeScript fields
 */
export function createTargetedTypeScriptPlaceholders(content: string, debug: boolean = false): TargetedPlaceholderResult {
  const replacements: Record<string, string> = {};
  let processedContent = content;
  let replacedFields = 0;
  const originalSize = content.length;

  // 1. Replace long prompt fields (template literals or strings)
  // prompt: `long template literal...` or prompt: "long string..."
  const promptRegex = /(\s+prompt:\s*)((['"`])([^]*?)\3)/g;
  processedContent = processedContent.replace(promptRegex, (match, prefix, fullValue) => {
    if (fullValue.length >= MIN_REPLACEMENT_LENGTH) {
      const placeholder = `<PROMPT_${generatePlaceholderId()}>`;
      replacements[placeholder] = fullValue;
      replacedFields++;
      return `${prefix}${placeholder}`;
    }
    return match;
  });

  // 2. Replace long description fields
  // description: "long description text..."
  const descriptionRegex = /(\s+description:\s*)((['"`])([^]*?)\3)/g;
  processedContent = processedContent.replace(descriptionRegex, (match, prefix, fullValue) => {
    if (fullValue.length >= MIN_REPLACEMENT_LENGTH) {
      const placeholder = `<DESC_${generatePlaceholderId()}>`;
      replacements[placeholder] = fullValue;
      replacedFields++;
      return `${prefix}${placeholder}`;
    }
    return match;
  });

  // 3. Replace inputSchema objects
  // inputSchema: { large object... }
  const inputSchemaRegex = /(\s+inputSchema:\s*)(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g;
  processedContent = processedContent.replace(inputSchemaRegex, (match, prefix, schemaObject) => {
    if (schemaObject.length >= MIN_REPLACEMENT_LENGTH) {
      const placeholder = `<INPUT_SCHEMA_${generatePlaceholderId()}>`;
      replacements[placeholder] = schemaObject;
      replacedFields++;
      return `${prefix}${placeholder}`;
    }
    return match;
  });

  // 4. Replace detailsSchema objects (for status components)
  // detailsSchema: z.object({ large schema... })
  const detailsSchemaRegex = /(\s+detailsSchema:\s*)(z\.object\(\{[^]*?\}\)(?:\.[^,}\s]+)*)/g;
  processedContent = processedContent.replace(detailsSchemaRegex, (match, prefix, schemaObject) => {
    if (schemaObject.length >= MIN_REPLACEMENT_LENGTH) {
      const placeholder = `<DETAILS_SCHEMA_${generatePlaceholderId()}>`;
      replacements[placeholder] = schemaObject;
      replacedFields++;
      return `${prefix}${placeholder}`;
    }
    return match;
  });

  // 5. Replace props objects (for artifact/data components)  
  // props: z.object({ large props schema... })
  const propsRegex = /(\s+props:\s*)(z\.object\(\{[^]*?\}\)(?:\.[^,}\s]+)*)/g;
  processedContent = processedContent.replace(propsRegex, (match, prefix, propsObject) => {
    if (propsObject.length >= MIN_REPLACEMENT_LENGTH) {
      const placeholder = `<PROPS_${generatePlaceholderId()}>`;
      replacements[placeholder] = propsObject;
      replacedFields++;
      return `${prefix}${placeholder}`;
    }
    return match;
  });

  // 6. Replace execute functions (for functionTools)
  // execute: async ({ param1, param2 }) => { function body... }
  const executeRegex = /(\s+execute:\s*)(async\s*\([^)]*\)\s*=>\s*\{[^]*?\})/g;
  processedContent = processedContent.replace(executeRegex, (match, prefix, executeFunction) => {
    if (executeFunction.length >= MIN_REPLACEMENT_LENGTH) {
      const placeholder = `<EXECUTE_${generatePlaceholderId()}>`;
      replacements[placeholder] = executeFunction;
      replacedFields++;
      return `${prefix}${placeholder}`;
    }
    return match;
  });

  const processedSize = processedContent.length;
  const savings = originalSize - processedSize;
  const savingsPercentage = originalSize > 0 ? (savings / originalSize) * 100 : 0;

  return {
    processedContent,
    replacements,
    stats: {
      originalSize,
      processedSize,
      savings,
      savingsPercentage,
      replacedFields,
    },
  };
}

/**
 * Restore placeholders in TypeScript content
 */
export function restoreTargetedTypeScriptPlaceholders(
  content: string,
  replacements: Record<string, string>
): string {
  let restoredContent = content;

  // Sort by placeholder length (longest first) to avoid partial replacements
  const sortedPlaceholders = Object.keys(replacements).sort((a, b) => b.length - a.length);

  for (const placeholder of sortedPlaceholders) {
    const originalValue = replacements[placeholder];
    
    // Simple string replacement (placeholders are unique and safe)
    restoredContent = restoredContent.replace(placeholder, originalValue);
  }

  return restoredContent;
}