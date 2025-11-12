/**
 * Targeted TypeScript Placeholder System
 *
 * Uses AST parsing to intelligently identify large content blocks for replacement:
 * - prompt: (template literals or strings)
 * - description: (string literals)
 * - inputSchema: (object literals)
 * - detailsSchema: (object literals)
 * - props: (object literals in artifact/data components)
 */

import { randomBytes } from 'node:crypto';
import { Project, Node, SyntaxKind } from 'ts-morph';

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
 * Create targeted placeholders using AST parsing for better accuracy
 */
export function createTargetedTypeScriptPlaceholders(
  content: string,
  debug: boolean = false
): TargetedPlaceholderResult {
  const replacements: Record<string, string> = {};
  let replacedFields = 0;
  const originalSize = content.length;

  try {
    // Create a temporary project to parse the TypeScript
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("temp.ts", content);

    // Track all replacements to apply them in order
    const replacementOperations: Array<{
      start: number;
      end: number;
      placeholder: string;
      originalText: string;
    }> = [];

    // Find all object literal expressions with specific property names
    sourceFile.forEachDescendant((node) => {
      if (Node.isPropertyAssignment(node)) {
        const propertyName = node.getName();
        const valueNode = node.getInitializer();
        
        if (!valueNode) return;

        // Get the exact text that will be replaced (no trimming to match boundaries)
        const valueText = valueNode.getText();
        if (valueText.trim().length < MIN_REPLACEMENT_LENGTH) return;

        let placeholderPrefix = '';
        
        // Check if this is a field we want to replace
        switch (propertyName) {
          case 'prompt':
            placeholderPrefix = 'PROMPT';
            break;
          case 'description':
            placeholderPrefix = 'DESC';
            break;
          case 'inputSchema':
            placeholderPrefix = 'INPUT_SCHEMA';
            break;
          case 'detailsSchema':
            placeholderPrefix = 'DETAILS_SCHEMA';
            break;
          case 'props':
            placeholderPrefix = 'PROPS';
            break;
          default:
            return; // Skip this property
        }

        // Get precise boundaries - use getFullStart and ensure we don't go beyond property boundaries
        const start = valueNode.getStart(sourceFile);
        const end = valueNode.getEnd();
        
        // Validate that the boundaries don't extend beyond the property assignment
        const propertyAssignment = node; // The PropertyAssignment node
        const propertyEnd = propertyAssignment.getEnd();
        
        // Debug boundary information
        console.log(`🔍 BOUNDARY DEBUG for ${propertyName}:`);
        console.log(`  Value node: start=${start}, end=${end}`);
        console.log(`  Property: start=${propertyAssignment.getStart(sourceFile)}, end=${propertyEnd}`);
        console.log(`  Value text: "${valueText.slice(0, 50)}..."`);
        console.log(`  Text after value: "${content.slice(end, end + 20)}"`);
        
        // If the value boundary extends beyond the property boundary, something is wrong
        if (end > propertyEnd) {
          console.log(`WARNING: ${propertyName} value boundary extends beyond property boundary, skipping`);
          return;
        }
        
        const actualText = content.slice(start, end);
        
        // Ensure getText() matches the actual slice - this is critical for correctness
        if (valueText !== actualText) {
          console.log(`WARNING: ${propertyName} getText() doesn't match slice boundaries, skipping`);
          console.log(`  getText(): "${valueText.slice(0, 50)}..."`);
          console.log(`  actualText: "${actualText.slice(0, 50)}..."`);
          return; // Skip this replacement to avoid corruption
        }
        
        // Additional validation: ensure the replacement doesn't contain parts of other properties
        const textAfterValue = content.slice(end, end + 20);
        if (!textAfterValue.match(/^\s*[,}]/)) {
          console.log(`WARNING: ${propertyName} boundary seems to cut into next property: "${textAfterValue}", skipping`);
          return;
        }

        // Create placeholder and track replacement
        const placeholder = `<${placeholderPrefix}_${generatePlaceholderId()}>`;
        replacements[placeholder] = valueText; // Store exact text that matches boundaries
        replacedFields++;

        // Use exact boundaries that match the getText() result
        replacementOperations.push({
          start: start,
          end: end,
          placeholder,
          originalText: valueText // This now matches what we'll actually replace
        });
      }
    });

    // Apply replacements from end to beginning to maintain positions
    replacementOperations.sort((a, b) => b.start - a.start);
    
    let processedContent = content;
    for (const op of replacementOperations) {
      processedContent = 
        processedContent.slice(0, op.start) + 
        op.placeholder + 
        processedContent.slice(op.end);
    }

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

  } catch (error) {
    // Fallback to original content if AST parsing fails
    return {
      processedContent: content,
      replacements: {},
      stats: {
        originalSize,
        processedSize: originalSize,
        savings: 0,
        savingsPercentage: 0,
        replacedFields: 0,
      },
    };
  }
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
